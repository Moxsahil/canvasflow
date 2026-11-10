/**
 * Counts a CodeQL SARIF file's results by severity, the way GitHub code
 * scanning labels them: `security-severity` (a CVSS score on the rule) maps to
 * critical ≥ 9.0, high ≥ 7.0, medium ≥ 4.0, low otherwise; rules without one
 * are listed under their SARIF level (error / warning / note).
 *
 *   node scripts/metrics/sarif-summary.mjs <file.sarif> [--list]
 */
import fs from 'node:fs';
import process from 'node:process';

const [file, flag] = process.argv.slice(2);
const sarif = JSON.parse(fs.readFileSync(file, 'utf8'));
const counts = {};
const lines = [];
for (const run of sarif.runs) {
  const rules = new Map();
  for (const r of run.tool.driver.rules ?? []) rules.set(r.id, r);
  for (const ext of run.tool.extensions ?? []) for (const r of ext.rules ?? []) rules.set(r.id, r);
  for (const res of run.results) {
    const rule = rules.get(res.ruleId) ?? {};
    const score = Number(rule.properties?.['security-severity']);
    const sev = Number.isFinite(score)
      ? score >= 9
        ? 'critical'
        : score >= 7
          ? 'high'
          : score >= 4
            ? 'medium'
            : 'low'
      : `no-score:${res.level ?? rule.defaultConfiguration?.level ?? 'warning'}`;
    counts[sev] = (counts[sev] ?? 0) + 1;
    const loc = res.locations?.[0]?.physicalLocation;
    lines.push(
      `${sev.padEnd(10)} ${res.ruleId.padEnd(40)} ${loc?.artifactLocation?.uri}:${loc?.region?.startLine}`,
    );
  }
}
process.stdout.write(`${JSON.stringify(counts)} total ${lines.length}\n`);
if (flag === '--list') process.stdout.write(lines.sort().join('\n') + '\n');
