import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../server/config/env.js';
import { createApp } from '../server/app.js';

const skip = process.env.MONGODB_URI ? false : 'skipped: no .env / MONGODB_URI';

describe('API foundation', { skip }, () => {
  let server;
  let base;

  before(async () => {
    const config = loadConfig(process.env);
    const app = createApp(config);
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  it('GET /api/v1/health returns a healthy envelope', async () => {
    const res = await fetch(`${base}/api/v1/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'bayo-portfolio-api');
    assert.ok(['connected', 'connecting', 'disconnecting', 'disconnected'].includes(body.db));
  });

  it('health responses carry rate-limit headers', async () => {
    const res = await fetch(`${base}/api/v1/health`);
    assert.ok(res.headers.get('ratelimit') || res.headers.get('x-ratelimit-limit'));
  });

  it('unknown API routes return the JSON error envelope', async () => {
    const res = await fetch(`${base}/api/v1/definitely-not-a-route`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.error.code, 'NOT_FOUND');
  });

  it('JSON body limit rejects oversized payloads with 413', async () => {
    const res = await fetch(`${base}/api/v1/health`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ blob: 'x'.repeat(300 * 1024) }),
    });
    assert.equal(res.status, 413);
  });
});
