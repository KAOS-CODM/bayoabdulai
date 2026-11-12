// Phase 5 — dynamic /projects/:slug route + admin preview (HTTP level).
// Separate test database so this suite never races the other suites.
// Set QA_FIXTURES=1 to keep the fixtures in the database afterwards for
// manual/browser verification (re-run without it to clean up).

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { loadConfig } from '../server/config/env.js';
import { connectDb, disconnectDb } from '../server/config/db.js';
import { createApp } from '../server/app.js';
import Admin from '../server/models/Admin.js';
import Project from '../server/models/Project.js';
import { renderProjectPage } from '../server/render/project-page.js';

process.env.MONGODB_DB_NAME = 'bayo-portfolio-test-detail';

const skip = process.env.MONGODB_URI ? false : 'skipped: no .env / MONGODB_URI';
const silentLog = { log() {}, warn() {}, error() {} };

const ADMIN_EMAIL = 'detail-test@example.com';
const ADMIN_PASSWORD = 'correct-horse-battery-staple';

function cookieJar(res) {
  const jar = {};
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(';');
    const i = pair.indexOf('=');
    jar[pair.slice(0, i).trim()] = pair.slice(i + 1);
  }
  return jar;
}
const cookieHeader = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');

const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const emptySeo = { title: '', description: '', canonical: '', image: '', imageAlt: '' };

// Example A — standard project: core sections, gallery, statistics, links.
const fixtureA = {
  title: 'Standard Fixture Project',
  slug: 'fixture-standard',
  shortDescription: 'Standard fixture covering the baseline case-study structure.',
  category: 'Mobile App Design',
  status: 'published',
  featured: true,
  displayOrder: 1,
  tags: ['Mobile Product Design', 'E-commerce'],
  role: 'UI/UX Designer',
  duration: '8 Weeks',
  tools: ['Figma', 'FigJam'],
  objectives: ['Make ordering effortless', 'Keep it <script>alert("xss")</script> proof'],
  overview: [para('This is the overview of the standard fixture.')],
  media: [{
    url: 'https://res.cloudinary.com/demo/image/upload/v1/cover.jpg',
    alt: 'Standard cover',
    caption: 'Cover caption',
    ratio: '16:10',
    sort: 0,
  }],
  links: [
    { label: 'Live site', url: 'https://example.com/live', kind: 'live' },
    { label: 'Brief PDF', url: 'https://example.com/standard-brief.pdf', kind: 'other' },
  ],
  sections: [
    { type: 'richText', title: 'Development Process', blocks: [para('Process narrative.')] },
    {
      type: 'imageGallery',
      title: 'Key Screens',
      images: [
        { url: '/assets/images/fast-food-delivery-app/hero.png', alt: 'Screen one', caption: 'Home screen', ratio: '16:10' },
        { url: 'https://res.cloudinary.com/demo/image/upload/v1/s2.jpg', alt: 'Screen two' },
      ],
    },
    {
      type: 'statistics',
      title: 'Results',
      items: [
        { value: '35%', label: 'Faster checkout' },
        { value: '4.8/5', label: 'Rating', note: 'post-launch survey' },
      ],
    },
    {
      type: 'linkCard',
      title: 'Prototype',
      heading: 'Try the prototype',
      text: 'Click through the flows.',
      links: [{ label: 'Open prototype', url: 'https://example.com/proto' }],
    },
    { type: 'richText', title: 'Final Solution', blocks: [para('Final solution narrative.')] },
  ],
  seo: emptySeo,
};

// Example B — system/dashboard project: different optional-section ordering.
const fixtureB = {
  title: 'System Dashboard Fixture',
  slug: 'fixture-system',
  shortDescription: 'System fixture with modules, steps, comparison and checklist.',
  category: 'Dashboard Design',
  status: 'published',
  featured: false,
  displayOrder: 2,
  tags: ['Design System', 'Dashboard'],
  role: 'Product Designer',
  duration: '12 Weeks',
  tools: ['Figma'],
  objectives: ['Unify navigation', 'Make data scannable'],
  overview: [para('Dashboard overview.')],
  media: [],
  links: [{ label: 'Repository', url: 'https://github.com/example/repo', kind: 'github' }],
  sections: [
    {
      type: 'beforeAfter',
      title: 'Old vs New Comparison',
      before: { url: '/assets/images/old-ui.png', alt: 'Old dashboard' },
      after: { url: '/assets/images/new-ui.png', alt: 'New dashboard', label: 'Redesign' },
      note: 'Legacy vs refreshed layout.',
    },
    {
      type: 'processSteps',
      title: 'Development Process',
      steps: [
        { title: 'Audit', description: 'Inventory existing screens.' },
        { title: 'Rebuild', description: 'New components.', image: { url: '/assets/images/step.png', alt: 'Step shot' } },
      ],
    },
    {
      type: 'keyModules',
      title: 'Key Modules',
      items: [
        { title: 'Sidebar', description: 'Primary navigation.' },
        { title: 'Data table', description: 'Sortable grid.' },
      ],
    },
    { type: 'checklist', title: 'Quality Checklist', items: ['Keyboard reachable', 'Screen reader labels'] },
    { type: 'richText', title: 'Final Solution', blocks: [para('Shipped the system.')] },
    { type: 'videoEmbed', title: 'Walkthrough', provider: 'youtube', videoId: 'dQw4w9WgXcQ', caption: 'Walkthrough video' },
    { type: 'videoEmbed', title: 'Broken', provider: 'vimeo', videoId: 'abc123' },
  ],
  seo: emptySeo,
};

const fixtureDraft = {
  title: 'Draft Fixture Project',
  slug: 'fixture-draft',
  shortDescription: 'Only admins may see this.',
  category: 'Internal',
  status: 'draft',
  overview: [para('Draft overview.')],
  sections: [{ type: 'richText', title: 'Secret Plan', blocks: [para('Draft-only content.')] }],
  seo: emptySeo,
};

const fixtureArchived = {
  title: 'Archived Fixture Project',
  slug: 'fixture-archived',
  shortDescription: 'Retired from the site.',
  category: 'Internal',
  status: 'archived',
  seo: emptySeo,
};

describe('Dynamic project detail pages', { skip }, () => {
  let server;
  let base;
  let jar = {};

  before(async () => {
    const config = loadConfig(process.env); // db = bayo-portfolio-test-detail
    await connectDb({ mongoUri: config.mongoUri, mongoDbName: config.mongoDbName, log: silentLog });
    await Project.deleteMany({});
    await Admin.deleteMany({});
    await Admin.create({
      email: ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4),
      role: 'admin',
    });
    await Project.create([fixtureA, fixtureB, fixtureDraft, fixtureArchived]);

    const app = createApp(config);
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (process.env.QA_FIXTURES) {
      console.log('[qa] fixtures kept in bayo-portfolio-test-detail (QA_FIXTURES=1)');
    } else {
      await Project.deleteMany({});
      await Admin.deleteMany({});
    }
    await disconnectDb();
  });

  const login = async () => {
    const res = await fetch(`${base}/api/v1/admin/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    assert.equal(res.status, 200, 'test admin login');
    jar = cookieJar(res);
    assert.ok(jar['bayo.sid'], 'session cookie set');
  };

  it('renders a published project as a complete HTML document', async () => {
    const res = await fetch(`${base}/projects/fixture-standard`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    const body = await res.text();
    assert.match(body, /<title>Standard Fixture Project \| Bayo Abdulai Badmus<\/title>/);
    assert.ok(body.includes('Standard fixture covering the baseline'));
    assert.ok(body.includes('On This Page'), 'TOC rendered');
    assert.ok(body.includes('Project Brief (PDF)'), 'PDF card gated on the .pdf link');
    assert.ok(body.includes('alt="Standard cover"'), 'cover image rendered from media[0]');
    assert.ok(body.includes('Home screen'), 'gallery figcaption rendered');
    assert.ok(body.includes('35%'), 'statistics rendered');
    assert.ok(!body.includes('undefined'), 'no raw undefined');
  });

  it('serves the correct project for the correct slug', async () => {
    const a = await (await fetch(`${base}/projects/fixture-standard`)).text();
    const b = await (await fetch(`${base}/projects/fixture-system`)).text();
    assert.ok(a.includes('Standard Fixture Project') && !a.includes('System Dashboard Fixture'));
    assert.ok(b.includes('System Dashboard Fixture') && !b.includes('Standard Fixture Project'));
  });

  it('preserves saved section order end-to-end (Example B)', async () => {
    const body = await (await fetch(`${base}/projects/fixture-system`)).text();
    const markers = ['Old vs New Comparison', 'Development Process', 'Key Modules', 'Quality Checklist', 'Final Solution', 'Walkthrough'];
    let last = -1;
    for (const m of markers) {
      const idx = body.indexOf(m);
      assert.ok(idx > last, `"${m}" appears after the previous section`);
      last = idx;
    }
    // Optional-section layout differs from Example A (comparison comes first)
    assert.ok(body.indexOf('Old vs New Comparison') < body.indexOf('Key Modules'));
    // before/after labels: default + custom
    assert.ok(body.includes('>Before<') || body.includes('Before\n'), 'default Before label');
    assert.ok(body.includes('Redesign'), 'custom After label');
    // video handling: one valid iframe, one safe fallback
    assert.ok(body.includes('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'));
    assert.ok(body.includes('Video unavailable'));
    assert.equal((body.match(/<iframe/g) || []).length, 1);
  });

  it('escapes hostile stored content end-to-end', async () => {
    const body = await (await fetch(`${base}/projects/fixture-standard`)).text();
    assert.ok(!body.includes('<script>alert("xss")</script>'), 'raw script never emitted');
    assert.ok(body.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'), 'escaped form present');
  });

  it('returns the uniform site 404 for an unknown slug', async () => {
    const res = await fetch(`${base}/projects/no-such-project`);
    assert.equal(res.status, 404);
    assert.match(await res.text(), /Page not found/);
  });

  it('returns the identical 404 for Draft projects (no existence leak)', async () => {
    const unknown = await fetch(`${base}/projects/no-such-project`);
    const draft = await fetch(`${base}/projects/fixture-draft`);
    assert.equal(draft.status, 404);
    const unknownBody = await unknown.text();
    const draftBody = await draft.text();
    assert.equal(draftBody, unknownBody, 'draft response is byte-identical to unknown slug');
    assert.ok(!draftBody.includes('Draft Fixture Project'));
    assert.ok(!draftBody.includes('Secret Plan'));
  });

  it('returns the identical 404 for Archived projects', async () => {
    const unknown = await fetch(`${base}/projects/no-such-project`);
    const archived = await fetch(`${base}/projects/fixture-archived`);
    assert.equal(archived.status, 404);
    assert.equal(await archived.text(), await unknown.text());
  });

  it('public output is byte-identical to the shared renderer output', async () => {
    const res = await fetch(`${base}/projects/fixture-standard`);
    const body = await res.text();
    const doc = await Project.findOne({ slug: 'fixture-standard' }).lean();
    assert.equal(body, renderProjectPage(doc, { preview: false }));
  });

  it('redirects unauthenticated preview requests to the admin shell', async () => {
    const res = await fetch(`${base}/admin/preview/fixture-draft`, { redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/admin');
  });

  it('lets an authenticated admin preview a Draft project without publishing it', async () => {
    await login();
    const res = await fetch(`${base}/admin/preview/fixture-draft`, { headers: { cookie: cookieHeader(jar) } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control') ?? '', /no-store/);
    const body = await res.text();
    assert.ok(body.includes('Draft Fixture Project'));
    assert.ok(body.includes('Secret Plan'), 'draft content visible to the admin');
    assert.ok(body.includes('noindex'), 'preview is noindexed');
    assert.ok(body.includes('Preview — draft project, not publicly visible.'));
    assert.ok(body.includes('Back to editor'));

    const doc = await Project.findOne({ slug: 'fixture-draft' }).lean();
    assert.equal(doc.status, 'draft', 'previewing never changes publication status');
  });

  it('preview uses the same renderer as the public page', async () => {
    const res = await fetch(`${base}/admin/preview/fixture-standard`, { headers: { cookie: cookieHeader(jar) } });
    assert.equal(res.status, 200);
    const body = await res.text();
    const doc = await Project.findOne({ slug: 'fixture-standard' }).lean();
    // Identical to the shared template except for the preview overlay.
    assert.equal(body, renderProjectPage(doc, { preview: true }));
    const stripPreviewOverlay = (html) => html
      .replace(/\n  <meta name="robots"[^>]*>/, '')
      .replace(/\n  <div style="position:fixed;bottom:0[\s\S]*?<\/div>/, '');
    assert.equal(stripPreviewOverlay(body), renderProjectPage(doc, { preview: false }));
  });

  it('404s preview for unknown slugs even when authenticated', async () => {
    const res = await fetch(`${base}/admin/preview/no-such-project`, { headers: { cookie: cookieHeader(jar) } });
    assert.equal(res.status, 404);
  });

  it('returns a safe HTML 500 when the database query fails', async () => {
    const original = Project.findOne;
    Project.findOne = () => {
      throw new Error('simulated outage mongodb://admin:secret@host:27017/db');
    };
    try {
      const res = await fetch(`${base}/projects/fixture-standard`);
      assert.equal(res.status, 500);
      const body = await res.text();
      assert.match(body, /Something went wrong/);
      assert.ok(!body.includes('simulated outage'), 'error message not leaked');
      assert.ok(!body.includes('mongodb://'), 'connection details not leaked');
      assert.ok(!body.includes('secret'), 'credentials not leaked');
    } finally {
      Project.findOne = original;
    }
  });
});
