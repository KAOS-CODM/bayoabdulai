// Non-database coverage for the styled site 404 and preserved API JSON errors.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { notFoundHandler, errorHandler } from '../server/middleware/errorHandler.js';
import { PUBLIC_DIR } from '../server/routes/pages.js';

describe('404 and API error handling', () => {
  let server;
  let base;
  let originalConsoleError;

  before(async () => {
    originalConsoleError = console.error;
    console.error = () => {};

    const app = express();
    app.disable('x-powered-by');
    app.use(express.static(PUBLIC_DIR, { index: false }));

    app.get('/boom', () => {
      throw new Error('leak me: mongodb://user:secret@host/db');
    });
    app.get('/api/boom', () => {
      throw new Error('leak me: mongodb://user:secret@host/db');
    });

    app.use(notFoundHandler);
    app.use(errorHandler);

    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    console.error = originalConsoleError;
  });

  it('serves the styled 404 file statically for Render static hosting', async () => {
    const res = await fetch(`${base}/404.html`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /data-testid="not-found"/);
    assert.match(body, /href="\/work"/);
    assert.match(body, /\/dist\/output\.css/);
  });

  it('serves styled HTML for unknown non-API routes', async () => {
    const res = await fetch(`${base}/no-such-page`);
    assert.equal(res.status, 404);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/);
    const body = await res.text();
    assert.match(body, /data-testid="not-found"/);
    assert.match(body, /Page not found/);
    assert.match(body, /Back home/);
    assert.match(body, /href="\/work"/);
    assert.doesNotMatch(body, /404 - Not found/);
  });

  it('serves styled HTML for unknown project detail routes', async () => {
    const res = await fetch(`${base}/projects/no-such-project`);
    assert.equal(res.status, 404);
    assert.match(await res.text(), /data-testid="not-found"/);
  });

  it('returns JSON for bare /api and /api/... misses', async () => {
    for (const path of ['/api', '/api/v1/no-such-route']) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.status, 404, path);
      assert.match(res.headers.get('content-type') ?? '', /application\/json/, path);
      const body = await res.json();
      assert.equal(body.ok, false, path);
      assert.equal(body.error.code, 'NOT_FOUND', path);
      assert.equal(body.error.message, `No route for GET ${path}`, path);
    }
  });

  it('keeps API 500 responses as safe JSON', async () => {
    const res = await fetch(`${base}/api/boom`);
    assert.equal(res.status, 500);
    assert.match(res.headers.get('content-type') ?? '', /application\/json/);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.error.code, 'INTERNAL_ERROR');
    assert.equal(body.error.message, 'Something went wrong on the server.');
    assert.ok(!JSON.stringify(body).includes('secret'));
  });

  it('keeps HTML 500 responses safe', async () => {
    const res = await fetch(`${base}/boom`);
    assert.equal(res.status, 500);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/);
    const body = await res.text();
    assert.match(body, /Something went wrong/);
    assert.ok(!body.includes('mongodb://'));
    assert.ok(!body.includes('secret'));
  });
});
