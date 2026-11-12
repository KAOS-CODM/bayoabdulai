import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../server/config/env.js';
import { createApp } from '../server/app.js';

const skip = process.env.MONGODB_URI ? false : 'skipped: no .env / MONGODB_URI';

describe('Admin API access restrictions', { skip }, () => {
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

  const fakeId = '000000000000000000000000';
  const endpoints = [
    ['GET', '/api/v1/admin/projects'],
    ['GET', `/api/v1/admin/projects/${fakeId}`],
    ['POST', '/api/v1/admin/projects'],
    ['PUT', `/api/v1/admin/projects/${fakeId}`],
    ['PATCH', `/api/v1/admin/projects/${fakeId}/status`],
    ['PATCH', `/api/v1/admin/projects/${fakeId}/featured`],
    ['PATCH', `/api/v1/admin/projects/${fakeId}/order`],
    ['POST', `/api/v1/admin/projects/${fakeId}/restore`],
    ['DELETE', `/api/v1/admin/projects/${fakeId}?confirm=true`],
    ['POST', '/api/v1/admin/uploads'],
    ['DELETE', '/api/v1/admin/uploads'],
  ];

  for (const [method, path] of endpoints) {
    it(`${method} ${path} requires authentication`, async () => {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: ['POST', 'PUT', 'PATCH'].includes(method) ? '{}' : undefined,
      });
      assert.equal(res.status, 401, `${method} ${path} must be 401 without a session`);
      const body = await res.json();
      assert.equal(body.ok, false);
      assert.equal(body.error.code, 'UNAUTHORIZED');
    });
  }

  it('public API still works without auth', async () => {
    const res = await fetch(`${base}/api/v1/health`);
    assert.equal(res.status, 200);
  });
});
