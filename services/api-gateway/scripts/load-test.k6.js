import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';

/**
 * HTTP load profile for the api-gateway.
 *
 * Deliberately not aimed at the sync layer — that speaks Yjs's binary
 * protocol over WebSocket, which k6 cannot generate without reimplementing
 * the protocol by hand. Real clients drive that instead, from
 * services/sync-server/scripts/load-test.ts. This covers the other half:
 * the plain request/response surface, where k6 is the right instrument.
 *
 * Usage:
 *   k6 run services/api-gateway/scripts/load-test.k6.js
 *   k6 run -e API_URL=http://localhost:3001 -e VUS=50 ...
 */

const BASE = __ENV.API_URL || 'http://localhost:3001';
const PEAK = Number(__ENV.VUS || 50);

const healthLatency = new Trend('health_latency', true);

export const options = {
  stages: [
    { duration: __ENV.RAMP || '20s', target: PEAK },
    { duration: __ENV.HOLD || '40s', target: PEAK },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    // Mirrors the sprint plan's reliability posture: essentially no failed
    // requests, and a p95 a person would not notice.
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  const res = http.get(`${BASE}/health`, { tags: { name: 'health' } });
  healthLatency.add(res.timings.duration);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'under 500ms': (r) => r.timings.duration < 500,
  });
}
