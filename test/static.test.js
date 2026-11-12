import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../server/config/env.js';
import { connectDb, disconnectDb } from '../server/config/db.js';
import { createApp } from '../server/app.js';

// Isolated scratch database: the /projects/:slug assertions below query the
// database (Phase 5), so this suite now needs a real connection — and it must
// never race the other suites or touch the dev database.
process.env.MONGODB_DB_NAME = 'bayo-portfolio-test-static';

const skip = process.env.MONGODB_URI ? false : 'skipped: no .env / MONGODB_URI';
const silentLog = { log() {}, warn() {}, error() {} };

describe('Existing website is served unchanged', { skip }, () => {
  let server;
  let base;

  before(async () => {
    const config = loadConfig(process.env);
    await connectDb({ mongoUri: config.mongoUri, mongoDbName: config.mongoDbName, log: silentLog });
    const app = createApp(config);
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await disconnectDb();
  });

  it('serves the homepage at /', async () => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /<title>Home \| Bayo Abdulai Badmus<\/title>/);
  });

  it('serves clean route /work with the real work page', async () => {
    const res = await fetch(`${base}/work`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /All Projects/);
  });

  it('keeps every original .html URL working', async () => {
    const pages = ['work.html', 'about.html', 'contact.html', 'resume.html', 'fast-food-delivery-app.html', 'career-ontrack-ai.html', 'nicn-redesign.html', 'nicn-clinic-his.html'];
    for (const page of pages) {
      const res = await fetch(`${base}/${page}`);
      assert.equal(res.status, 200, `${page} should still be reachable`);
    }
  });

  it('serves the other clean routes', async () => {
    for (const route of ['/about', '/contact', '/resume', '/admin']) {
      const res = await fetch(`${base}${route}`);
      assert.equal(res.status, 200, `${route} should be reachable`);
    }
  });

  it('serves static assets (logo, built CSS, theme JS)', async () => {
    for (const asset of ['/assets/images/bayo-mark.svg', '/dist/output.css', '/js/theme.js']) {
      const res = await fetch(`${base}${asset}`);
      assert.equal(res.status, 200, `${asset} should be reachable`);
    }
  });

  it('project route 404s for slugs with no published database record', async () => {
    const res = await fetch(`${base}/projects/fast-food-delivery-app`);
    assert.equal(res.status, 404);
  });

  it('unknown pages return a friendly 404 page', async () => {
    const res = await fetch(`${base}/no-such-page`);
    assert.equal(res.status, 404);
    assert.match(await res.text(), /Page not found/);
  });

  it('sends security headers and hides the framework', async () => {
    const res = await fetch(`${base}/`);
    assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'self'/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-powered-by'), null);
  });
});
