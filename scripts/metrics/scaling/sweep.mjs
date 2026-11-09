// Raises N until a level stops being stable, for one server layout.
//
//   node scripts/metrics/scaling/sweep.mjs --mode=solo --levels=500,1000,2000,5000 --runs=2 [--tag=name]
//   (--presence=0 and the other coordinator.mjs flags are passed through)
//
// Modes:
//   solo  one sync-server, no Redis (the production default), clients connect to it directly
//   lb1   one sync-server with Redis, behind nginx
//   lb2   two sync-servers with Redis, behind nginx (round-robin, no stickiness)
//
// A level is stable when, in every run, all N clients connect, no update is
// dropped, delivery p95 is at most 1 s and no server container died, was
// OOM-killed or restarted. Each run starts from freshly restarted servers.
// While a run is going, the server containers' CPU and memory (docker stats),
// open file descriptors (/proc/1/fd) and Postgres connections
// (pg_stat_activity) are sampled, and the peaks are kept with the result.
import { spawn, execFileSync, execFile } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HERE, RESULTS, args, machine, sleep } from './lib.mjs';

const a = args();
const MODE = a.mode ?? 'lb2';
const LEVELS = String(a.levels ?? '500,1000,2000,5000')
  .split(',')
  .map(Number);
const RUNS = Number(a.runs ?? 2);
/** Names this sweep's files apart from another sweep of the same mode. */
const TAG = a.tag ? `-${a.tag}` : '';
const P95_LIMIT_MS = 1000;
const RUN_TIMEOUT_MS = Number(a['run-timeout'] ?? 8) * 60_000;
const PASS = Object.entries(a)
  .filter(([k]) => ['ramp', 'procs', 'presence', 'edit-seconds', 'edit-gap', 'writers'].includes(k))
  .map(([k, v]) => `--${k}=${v}`);

const COMPOSE = resolve(HERE, '../../../infra/scaling/docker-compose.yml');
const LAYOUTS = {
  solo: {
    servers: ['sync-solo'],
    url: 'ws://sync-solo:4000',
    up: ['postgres', 'sync-solo'],
    env: {},
  },
  lb1: {
    servers: ['sync-1'],
    url: 'ws://lb:4000',
    up: ['postgres', 'redis', 'sync-1', 'lb'],
    env: { SYNC_UPSTREAMS: 'server sync-1:4000;' },
  },
  lb2: {
    servers: ['sync-1', 'sync-2'],
    url: 'ws://lb:4000',
    up: ['postgres', 'redis', 'sync-1', 'sync-2', 'lb'],
    env: {},
  },
};
const layout = LAYOUTS[MODE];
if (!layout) throw new Error(`unknown --mode=${MODE}`);
const ALL_SERVERS = ['sync-1', 'sync-2', 'sync-solo', 'lb'];
const cname = (svc) => `canvasflow-scaling-${svc}-1`;

const composeEnv = { ...process.env, ...layout.env };
function compose(...argv) {
  return execFileSync('docker', ['compose', '-f', COMPOSE, '--profile', 'solo', ...argv], {
    env: composeEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString();
}
const docker = (...argv) =>
  new Promise((res) =>
    execFile('docker', argv, { timeout: 15_000 }, (err, stdout) => res(err ? '' : String(stdout))),
  );

async function waitHealthy(services) {
  for (let i = 0; i < 120; i++) {
    const states = await Promise.all(
      services.map((s) => docker('inspect', '-f', '{{.State.Health.Status}}', cname(s))),
    );
    if (states.every((s) => s.trim() === 'healthy')) return;
    await sleep(1000);
  }
  throw new Error(`not healthy: ${services.join(', ')}`);
}

/** Start exactly this layout's services; stop the other sync containers. */
async function bringUp() {
  const others = ALL_SERVERS.filter((s) => !layout.up.includes(s));
  if (others.length) compose('stop', ...others);
  compose(
    'up',
    '-d',
    '--force-recreate',
    ...layout.up.filter((s) => s !== 'postgres' && s !== 'redis'),
  );
  await waitHealthy(layout.servers);
}

async function freshServers() {
  compose('restart', ...layout.servers);
  await waitHealthy(layout.servers);
  if (layout.up.includes('lb')) compose('restart', 'lb');
  await sleep(1500);
}

/** MiB from docker stats' "123.4MiB / 1GiB". */
function toMiB(s) {
  const m = /([\d.]+)\s*([KMG]i?B)/.exec(s);
  if (!m) return NaN;
  const n = Number(m[1]);
  return { KiB: n / 1024, KB: n / 1024, MiB: n, MB: n, GiB: n * 1024, GB: n * 1024 }[m[2]] ?? NaN;
}

function startSampler() {
  const samples = [];
  let running = true;
  const loop = (async () => {
    while (running) {
      const t = Date.now();
      const [statsOut, pgOut, ...fds] = await Promise.all([
        docker('stats', '--no-stream', '--format', '{{json .}}'),
        docker(
          'exec',
          cname('postgres'),
          'psql',
          '-U',
          'postgres',
          '-tAc',
          "select count(*) from pg_stat_activity where datname = 'canvasflow' and pid <> pg_backend_pid()",
        ),
        ...layout.servers.map((s) => docker('exec', cname(s), 'sh', '-c', 'ls /proc/1/fd | wc -l')),
      ]);
      const row = { t, pgConnections: Number(pgOut.trim()) || null, containers: {} };
      layout.servers.forEach(
        (s, i) => (row.containers[s] = { fds: Number(fds[i].trim()) || null }),
      );
      for (const line of statsOut.split('\n').filter(Boolean)) {
        const j = JSON.parse(line);
        const svc = j.Name.replace(/^canvasflow-scaling-/, '').replace(/-1$/, '');
        row.containers[svc] = {
          ...row.containers[svc],
          cpuPct: Number(j.CPUPerc.replace('%', '')),
          memMiB: toMiB(j.MemUsage.split('/')[0]),
        };
      }
      samples.push(row);
    }
  })();
  return async () => {
    running = false;
    await loop;
    return samples;
  };
}

function peaks(samples) {
  const out = { pgConnectionsMax: Math.max(0, ...samples.map((s) => s.pgConnections ?? 0)) };
  const names = new Set(samples.flatMap((s) => Object.keys(s.containers)));
  for (const n of names) {
    const rows = samples.map((s) => s.containers[n]).filter(Boolean);
    const cpu = rows.map((r) => r.cpuPct).filter(Number.isFinite);
    out[n] = {
      cpuPctMax: Math.max(0, ...cpu),
      cpuPctMedian: cpu.sort((x, y) => x - y)[Math.floor(cpu.length / 2)] ?? null,
      memMiBMax: Math.max(0, ...rows.map((r) => r.memMiB).filter(Number.isFinite)),
      fdsMax: Math.max(0, ...rows.map((r) => r.fds ?? 0)),
    };
  }
  return out;
}

async function serverHealth() {
  const out = {};
  for (const s of layout.servers) {
    const j = JSON.parse(await docker('inspect', cname(s)))[0];
    out[s] = {
      running: j.State.Running,
      oomKilled: j.State.OOMKilled,
      exitCode: j.State.ExitCode,
      restartCount: j.RestartCount,
    };
  }
  return out;
}

function runLevel(N, run, out) {
  return new Promise((res, rej) => {
    const child = spawn(
      'docker',
      [
        'compose',
        '-f',
        COMPOSE,
        '--profile',
        'load',
        'run',
        '--rm',
        '--name',
        'canvasflow-scaling-loadgen-1',
        'loadgen',
        'coordinator.mjs',
        `--n=${N}`,
        `--url=${layout.url}`,
        `--out=${out}`,
        ...PASS,
      ],
      { env: composeEnv, stdio: ['ignore', 'inherit', 'inherit'] },
    );
    // A level that cannot finish (servers saturated, clients reconnecting in a
    // loop) would otherwise run until the generator runs out of memory.
    let timedOut = false;
    const deadline = setTimeout(() => {
      timedOut = true;
      execFile('docker', ['rm', '-f', 'canvasflow-scaling-loadgen-1'], () => {});
    }, RUN_TIMEOUT_MS);
    child.on('exit', (code) => {
      clearTimeout(deadline);
      if (timedOut) rej(new Error(`run did not finish within ${RUN_TIMEOUT_MS / 60_000} min`));
      else if (code === 0) res();
      else rej(new Error(`loadgen exited ${code}`));
    });
  });
}

mkdirSync(resolve(RESULTS, 'sweep'), { recursive: true });
console.log(`mode=${MODE} levels=${LEVELS.join(',')} runs=${RUNS} ${PASS.join(' ')}`);
await bringUp();

const runs = [];
let highestStable = null;
let firstFailure = null;
outer: for (const N of LEVELS) {
  for (let r = 1; r <= RUNS; r++) {
    await freshServers();
    const since = new Date().toISOString();
    const stop = startSampler();
    const rel = `results/sweep/${MODE}${TAG}-${N}-${r}.json`;
    let error = null;
    try {
      await runLevel(N, r, rel);
    } catch (err) {
      error = String(err.message);
    }
    const samples = await stop();
    const health = await serverHealth();
    let level = null;
    try {
      level = JSON.parse(readFileSync(resolve(HERE, rel), 'utf8'));
    } catch {}
    const logs = {};
    for (const s of layout.servers) {
      logs[s] = (await docker('logs', '--since', since, '--tail', '20', cname(s))).slice(-4000);
    }
    const reasons = [];
    // The generator dying with healthy servers is a limit of this machine,
    // not of the sync-server, and is reported as such.
    const generatorFailed =
      Boolean(error) &&
      !/did not finish/.test(error) &&
      Object.values(health).every((h) => h.running && !h.oomKilled);
    if (error) reasons.push(generatorFailed ? `generator failed (${error})` : error);
    if (level) {
      if (level.connected < N) reasons.push(`connected ${level.connected}/${N}`);
      if (level.dropped > 0) reasons.push(`dropped ${level.dropped}/${level.expected}`);
      if (!(level.latencyMs.p95 <= P95_LIMIT_MS))
        reasons.push(`p95 ${level.latencyMs.p95?.toFixed(0)} ms > ${P95_LIMIT_MS} ms`);
    }
    for (const [s, h] of Object.entries(health)) {
      if (!h.running) reasons.push(`${s} not running (exit ${h.exitCode})`);
      if (h.oomKilled) reasons.push(`${s} OOM-killed`);
      if (h.restartCount) reasons.push(`${s} restarted`);
    }
    const entry = {
      N,
      run: r,
      stable: reasons.length === 0,
      generatorFailed,
      reasons,
      level,
      peaks: peaks(samples),
      health,
      samples,
      logs,
    };
    runs.push(entry);
    const pk = entry.peaks;
    console.log(
      `  N=${N} run=${r} ${entry.stable ? 'STABLE' : `UNSTABLE: ${reasons.join('; ')}`} | ` +
        layout.servers
          .map(
            (s) =>
              `${s} cpu max ${pk[s]?.cpuPctMax}% mem max ${pk[s]?.memMiBMax?.toFixed(0)} MiB fds ${pk[s]?.fdsMax}`,
          )
          .join(' | ') +
        ` | pg conns max ${pk.pgConnectionsMax} | loadgen cpu max ${pk.loadgen?.cpuPctMax}%`,
    );
    if (!entry.stable) {
      firstFailure = { N, run: r, reasons, generatorFailed };
      break outer;
    }
  }
  highestStable = N;
}

const file = resolve(RESULTS, `sweep-${MODE}${TAG}.json`);
writeFileSync(
  file,
  JSON.stringify(
    {
      metric: 'scaling-sweep',
      mode: MODE,
      levels: LEVELS,
      runsPerLevel: RUNS,
      pass: PASS,
      p95LimitMs: P95_LIMIT_MS,
      highestStable,
      firstFailure,
      runs,
      machine: machine(),
    },
    null,
    2,
  ),
);
console.log(
  `mode=${MODE} highest stable N: ${highestStable ?? 'none'}${firstFailure ? `; first failure at N=${firstFailure.N}: ${firstFailure.reasons.join('; ')}` : ' (no failure in the levels tested)'}`,
);
console.log(`wrote ${file}`);
