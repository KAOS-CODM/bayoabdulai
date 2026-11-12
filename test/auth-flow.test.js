import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { loadConfig } from '../server/config/env.js';
import { connectDb, disconnectDb } from '../server/config/db.js';
import { createApp } from '../server/app.js';
import Admin from '../server/models/Admin.js';
import Project from '../server/models/Project.js';

// Separate test database so this suite never races projects-api.test.js.
process.env.MONGODB_DB_NAME = 'bayo-portfolio-test-auth';

const skip = process.env.MONGODB_URI ? false : 'skipped: no .env / MONGODB_URI';
const silentLog = { log() {}, warn() {}, error() {} };

const ADMIN_EMAIL = 'flow-test@example.com';
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

describe('Admin authentication flow', { skip }, () => {
  let server;
  let base;
  let jar = {};
  let csrf = '';
  let projectId = '';

  before(async () => {
    const config = loadConfig(process.env); // db = bayo-portfolio-test-auth
    await connectDb({ mongoUri: config.mongoUri, mongoDbName: config.mongoDbName, log: silentLog });
    await Admin.deleteMany({});
    await Project.deleteMany({});
    await Admin.create({
      email: ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4), // low rounds: test speed
      role: 'admin',
    });

    const app = createApp(config);
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await Admin.deleteMany({});
    await Project.deleteMany({});
    await disconnectDb();
  });

  const login = (email, password) => fetch(`${base}/api/v1/admin/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const adminReq = (method, path, body) => fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      cookie: cookieHeader(jar),
      'x-csrf-token': csrf,
    },
    body: JSON.stringify(body),
  });

  it('rejects a wrong password (attempt 1 of 10)', async () => {
    const res = await login(ADMIN_EMAIL, 'nope');
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error.code, 'INVALID_CREDENTIALS');
  });

  it('rejects an unknown email with the identical message (attempt 2)', async () => {
    const res = await login('ghost@example.com', 'x');
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, 'INVALID_CREDENTIALS');
    assert.equal(body.error.message, 'Invalid email or password.');
  });

  it('rejects malformed login payloads with 400 (attempt 3)', async () => {
    const res = await fetch(`${base}/api/v1/admin/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'VALIDATION_ERROR');
  });

  it('logs in and issues session + CSRF cookies (attempt 4)', async () => {
    const res = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    assert.equal(res.status, 200);
    jar = cookieJar(res);
    assert.ok(jar['bayo.sid'], 'session cookie set');
    assert.ok(jar['bayo_csrf'], 'csrf cookie set');
    const body = await res.json();
    csrf = body.data.csrfToken;
    assert.equal(body.data.email, ADMIN_EMAIL);
    assert.equal(csrf, jar['bayo_csrf']);
  });

  it('returns identity for GET /me with the session', async () => {
    const res = await fetch(`${base}/api/v1/admin/auth/me`, { headers: { cookie: cookieHeader(jar) } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.email, ADMIN_EMAIL);
    assert.equal(body.data.role, 'admin');
  });

  it('401s /me without a session', async () => {
    const res = await fetch(`${base}/api/v1/admin/auth/me`);
    assert.equal(res.status, 401);
  });

  it('rejects mutations without a CSRF header (403)', async () => {
    const res = await fetch(`${base}/api/v1/admin/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader(jar) },
      body: JSON.stringify({ title: 'X', shortDescription: 'Y', category: 'Web App' }),
    });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.code, 'CSRF_FAILED');
  });

  it('rejects mutations with a forged CSRF token (403)', async () => {
    const res = await fetch(`${base}/api/v1/admin/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader(jar), 'x-csrf-token': 'forged-token' },
      body: JSON.stringify({ title: 'X', shortDescription: 'Y', category: 'Web App' }),
    });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.code, 'CSRF_FAILED');
  });

  it('creates a project with session + CSRF (201)', async () => {
    const res = await adminReq('POST', '/api/v1/admin/projects', {
      title: 'Auth Flow Project',
      shortDescription: 'Made by the auth flow test.',
      category: 'Web App',
      slug: 'auth-flow-project',
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    projectId = body.data.id;
    assert.equal(body.data.status, 'draft'); // safe default: not public yet
    assert.equal(body.data.version, 1);
    assert.ok(!('_id' in body.data));
  });

  it('keeps the draft invisible to the public API', async () => {
    const list = await (await fetch(`${base}/api/v1/projects?limit=50`)).json();
    assert.ok(!list.data.some((p) => p.slug === 'auth-flow-project'));
    const detail = await fetch(`${base}/api/v1/projects/auth-flow-project`);
    assert.equal(detail.status, 404);
  });

  it('rejects a stale update with 409 VERSION_CONFLICT (optimistic concurrency)', async () => {
    const okRes = await adminReq('PUT', `/api/v1/admin/projects/${projectId}`, {
      title: 'Auth Flow Project',
      shortDescription: 'Updated description.',
      category: 'Web App',
      version: 1,
    });
    assert.equal(okRes.status, 200);
    assert.equal((await okRes.json()).data.version, 2);

    const staleRes = await adminReq('PUT', `/api/v1/admin/projects/${projectId}`, {
      title: 'Auth Flow Project',
      shortDescription: 'Stale write.',
      category: 'Web App',
      version: 1,
    });
    assert.equal(staleRes.status, 409);
    const body = await staleRes.json();
    assert.equal(body.error.code, 'VERSION_CONFLICT');
    assert.equal(body.error.details.currentVersion, 2);
  });

  it('publishes via PATCH status and appears in the public API', async () => {
    const res = await adminReq('PATCH', `/api/v1/admin/projects/${projectId}/status`, { status: 'published' });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).data.status, 'published');

    const list = await (await fetch(`${base}/api/v1/projects?limit=50`)).json();
    assert.ok(list.data.some((p) => p.slug === 'auth-flow-project'));

    const cats = await (await fetch(`${base}/api/v1/categories`)).json();
    assert.ok(cats.data.some((c) => c.name === 'Web App'));
  });

  it('requires explicit confirmation for permanent deletion', async () => {
    const res = await fetch(`${base}/api/v1/admin/projects/${projectId}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader(jar), 'x-csrf-token': csrf },
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'CONFIRMATION_REQUIRED');

    const still = await fetch(`${base}/api/v1/admin/projects/${projectId}`, { headers: { cookie: cookieHeader(jar) } });
    assert.equal(still.status, 200);
  });

  it('deletes with ?confirm=true and CSRF', async () => {
    const res = await fetch(`${base}/api/v1/admin/projects/${projectId}?confirm=true`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader(jar), 'x-csrf-token': csrf },
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).data.deleted, true);

    const gone = await fetch(`${base}/api/v1/admin/projects/${projectId}`, { headers: { cookie: cookieHeader(jar) } });
    assert.equal(gone.status, 404);
  });

  it('rejects multipart uploads without a CSRF token (403)', async () => {
    const fd = new FormData();
    fd.append('image', new Blob(['tiny'], { type: 'image/png' }), 'x.png');
    const res = await fetch(`${base}/api/v1/admin/uploads`, {
      method: 'POST',
      headers: { cookie: cookieHeader(jar) },
      body: fd,
    });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.code, 'CSRF_FAILED');
  });

  it('rejects disallowed file types with the allow-list error (400)', async () => {
    const fd = new FormData();
    fd.append('image', new Blob(['definitely not an image'], { type: 'text/plain' }), 'x.txt');
    const res = await fetch(`${base}/api/v1/admin/uploads`, {
      method: 'POST',
      headers: { cookie: cookieHeader(jar), 'x-csrf-token': csrf },
      body: fd,
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'UNSUPPORTED_TYPE');
  });

  it('rejects spoofed images that fail the magic-byte check (400)', async () => {
    const fd = new FormData();
    fd.append('image', new Blob(['fake png bytes, not really'], { type: 'image/png' }), 'x.png');
    const res = await fetch(`${base}/api/v1/admin/uploads`, {
      method: 'POST',
      headers: { cookie: cookieHeader(jar), 'x-csrf-token': csrf },
      body: fd,
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'UNSUPPORTED_TYPE');
  });

  it('refuses to destroy assets outside the project folder (400)', async () => {
    const res = await fetch(`${base}/api/v1/admin/uploads?publicId=${encodeURIComponent('other-folder/asset')}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader(jar), 'x-csrf-token': csrf },
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'INVALID_PUBLIC_ID');
  });

  it('blocks destroying an image a project still references (409)', async () => {
    const created = await adminReq('POST', '/api/v1/admin/projects', {
      title: 'Reference Holder',
      shortDescription: 'Holds a media reference for the guard test.',
      category: 'Web App',
      slug: 'ref-holder',
      media: [{
        url: 'https://res.cloudinary.com/demo/image/upload/q_auto/bayo-portfolio/ref-check-asset.png',
        publicId: 'bayo-portfolio/ref-check-asset',
        alt: 'reference fixture',
      }],
    });
    assert.equal(created.status, 201);
    const holderId = (await created.json()).data.id;

    const guard = await fetch(`${base}/api/v1/admin/uploads?publicId=${encodeURIComponent('bayo-portfolio/ref-check-asset')}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader(jar), 'x-csrf-token': csrf },
    });
    assert.equal(guard.status, 409);
    assert.equal((await guard.json()).error.code, 'MEDIA_REFERENCES');

    // Approved order: detach the reference first, then the record can go.
    const detach = await adminReq('PUT', `/api/v1/admin/projects/${holderId}`, {
      title: 'Reference Holder',
      shortDescription: 'Holds a media reference for the guard test.',
      category: 'Web App',
      media: [],
      version: 1,
    });
    assert.equal(detach.status, 200);
    const del = await fetch(`${base}/api/v1/admin/projects/${holderId}?confirm=true`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader(jar), 'x-csrf-token': csrf },
    });
    assert.equal(del.status, 200);
  });

  it('logs out with CSRF and invalidates the session', async () => {
    const res = await fetch(`${base}/api/v1/admin/auth/logout`, {
      method: 'POST',
      headers: { cookie: cookieHeader(jar), 'x-csrf-token': csrf },
    });
    assert.equal(res.status, 200);

    const me = await fetch(`${base}/api/v1/admin/auth/me`, { headers: { cookie: cookieHeader(jar) } });
    assert.equal(me.status, 401);
  });

  it('rate-limits repeated failed logins (401s to attempt 10, then 429)', async () => {
    // Login attempts used so far: 4 (wrong, ghost, malformed, valid).
    // Attempts 5-10 may fail normally; attempt 11 must be throttled.
    for (let i = 0; i < 6; i += 1) {
      const res = await login(ADMIN_EMAIL, `wrong-password-${i}`);
      assert.equal(res.status, 401, `attempt ${5 + i} should still be 401`);
    }
    const limited = await login(ADMIN_EMAIL, 'wrong');
    assert.equal(limited.status, 429);
    const body = await limited.json();
    assert.equal(body.error.code, 'RATE_LIMITED');
  });
});
