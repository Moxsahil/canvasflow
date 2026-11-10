// A stand-in for Resend's HTTP API, for the local end-to-end stack.
//
// The gateway and web app use the official SDK, which sends to RESEND_BASE_URL
// when it is set, so pointing that here keeps every email on this machine with
// no change to the apps. Each accepted message is answered the way Resend
// answers (an id) and appended to a JSON-lines file for inspection.
import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { createServer } from 'node:http';

export function startFakeResend({ port, logFile }) {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const reply = (status, json) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(json));
      };
      if (req.method === 'POST' && req.url === '/emails') {
        const id = randomUUID();
        let message = {};
        try {
          message = JSON.parse(body);
        } catch {
          return reply(422, { name: 'validation_error', message: 'Invalid JSON' });
        }
        appendFileSync(
          logFile,
          `${JSON.stringify({ id, at: new Date().toISOString(), to: message.to, subject: message.subject })}\n`,
        );
        return reply(200, { id });
      }
      if (req.method === 'POST' && req.url === '/emails/batch') {
        const messages = JSON.parse(body || '[]');
        const data = messages.map((m) => {
          const id = randomUUID();
          appendFileSync(logFile, `${JSON.stringify({ id, to: m.to, subject: m.subject })}\n`);
          return { id };
        });
        return reply(200, { data });
      }
      reply(404, { name: 'not_found', message: `fake Resend has no ${req.method} ${req.url}` });
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
