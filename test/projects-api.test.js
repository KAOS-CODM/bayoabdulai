import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../server/config/env.js';
import { connectDb, disconnectDb } from '../server/config/db.js';
import { createApp } from '../server/app.js';
import Project from '../server/models/Project.js';

// Test fixtures must never touch the development database.
process.env.MONGODB_DB_NAME = 'bayo-portfolio-test';

const skip = process.env.MONGODB_URI ? false : 'skipped: no .env / MONGODB_URI';
const silentLog = { log() {}, warn() {}, error() {} };

describe('Public projects API', { skip }, () => {
  let server;
  let base;

  before(async () => {
    const config = loadConfig(process.env); // db name now = bayo-portfolio-test
    await connectDb({ mongoUri: config.mongoUri, mongoDbName: config.mongoDbName, log: silentLog });

    await Project.deleteMany({});
    await Project.create([
      {
        title: 'Alpha App',
        slug: 'alpha-app',
        shortDescription: 'Alpha description.',
        category: 'Web App',
        status: 'published',
        displayOrder: 2,
        sections: [{ type: 'statistics', items: [{ value: '40%', label: 'Faster' }] }],
        media: [{ url: '/assets/images/x.png', alt: 'shot' }],
      },
      {
        title: 'Beta App',
        slug: 'beta-app',
        shortDescription: 'Beta description.',
        category: 'Mobile App',
        status: 'published',
        displayOrder: 1,
        featured: true,
        tags: ['portfolio'],
      },
      {
        title: 'Gamma Draft',
        slug: 'gamma-draft',
        shortDescription: 'Hidden draft.',
        category: 'Draft Category',
        status: 'draft',
      },
      {
        title: 'Delta Archived',
        slug: 'delta-archived',
        shortDescription: 'Hidden archived.',
        category: 'Archive Category',
        status: 'archived',
      },
    ]);

    const app = createApp(config);
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    // The Atlas user lacks the dropDatabase privilege, so cleanup uses
    // deleteMany (granted via readWrite); before() also clears fixtures.
    await Project.deleteMany({});
    await disconnectDb();
  });

  it('lists only published projects in display order', async () => {
    const res = await fetch(`${base}/api/v1/projects`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.deepEqual(body.data.map((p) => p.slug), ['beta-app', 'alpha-app']);
    assert.equal(body.pagination.total, 2);
  });

  it('never exposes draft or archived projects in listings', async () => {
    const body = await (await fetch(`${base}/api/v1/projects?limit=50`)).json();
    const slugs = body.data.map((p) => p.slug);
    assert.ok(!slugs.includes('gamma-draft'));
    assert.ok(!slugs.includes('delta-archived'));
  });

  it('filters by category', async () => {
    const body = await (await fetch(`${base}/api/v1/projects?category=${encodeURIComponent('Web App')}`)).json();
    assert.deepEqual(body.data.map((p) => p.slug), ['alpha-app']);
  });

  it('searches title and tags but never draft content', async () => {
    const byTitle = await (await fetch(`${base}/api/v1/projects?search=beta`)).json();
    assert.deepEqual(byTitle.data.map((p) => p.slug), ['beta-app']);

    const byTag = await (await fetch(`${base}/api/v1/projects?search=portfolio`)).json();
    assert.deepEqual(byTag.data.map((p) => p.slug), ['beta-app']);

    const hidden = await (await fetch(`${base}/api/v1/projects?search=gamma`)).json();
    assert.equal(hidden.data.length, 0);
  });

  it('clamps absurd page limits', async () => {
    const body = await (await fetch(`${base}/api/v1/projects?limit=9999`)).json();
    assert.equal(body.pagination.limit, 50);
  });

  it('returns featured published projects only', async () => {
    const body = await (await fetch(`${base}/api/v1/projects/featured`)).json();
    assert.deepEqual(body.data.map((p) => p.slug), ['beta-app']);
  });

  it('serves a published project detail with structured sections', async () => {
    const body = await (await fetch(`${base}/api/v1/projects/alpha-app`)).json();
    assert.equal(body.ok, true);
    assert.equal(body.data.slug, 'alpha-app');
    assert.equal(body.data.sections.length, 1);
    assert.equal(body.data.sections[0].type, 'statistics');
    assert.equal(body.data.media[0].ratio, '16:10'); // default imagery ratio (section 4)
    assert.equal(body.data.version, 1);
    assert.ok(!('_id' in body.data));
    assert.ok(!('__v' in body.data));
  });

  it('404s for draft, archived and unknown slugs', async () => {
    for (const slug of ['gamma-draft', 'delta-archived', 'no-such-project']) {
      const res = await fetch(`${base}/api/v1/projects/${slug}`);
      assert.equal(res.status, 404, `${slug} must not be publicly reachable`);
    }
  });

  it('derives categories from published projects only', async () => {
    const body = await (await fetch(`${base}/api/v1/categories`)).json();
    assert.deepEqual(body.data, [
      { name: 'Mobile App', count: 1 },
      { name: 'Web App', count: 1 },
    ]);
  });
});
