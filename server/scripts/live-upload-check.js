// Live end-to-end verification of the Phase 4 Cloudinary upload pipeline.
// Runs against a SCRATCH database so the dev database is never touched:
//   $env:MONGODB_DB_NAME='bayo-portfolio-live-check'; npm run live:uploads
// Steps: login -> upload real PNG -> CDN serves it -> spoof/size rejected ->
// reference guard blocks destroy -> detach -> destroy -> CDN no longer serves.
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { loadConfig } from '../config/env.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { createApp } from '../app.js';
import Admin from '../models/Admin.js';
import Project from '../models/Project.js';
import { destroyImage } from '../config/cloudinary.js';

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const EMAIL = 'live-check@example.com';
const PASSWORD = 'Live-Check-Password-9!'; // scratch-db account only, cleaned up below

let passed = 0;
let asset = null;         // the uploaded asset, tracked for failure cleanup
let assetDestroyed = false;
const step = (name) => {
  passed += 1;
  console.log(`  ok ${passed} - ${name}`);
};

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

async function main() {
  const config = loadConfig(process.env);
  console.log(`[live-check] database: ${config.mongoDbName}`); // db name only; no secrets
  await connectDb(config);

  await Admin.deleteMany({ email: EMAIL });
  await Project.deleteMany({ slug: 'live-check-holder' });
  await Admin.create({ email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 4), role: 'admin' });

  const app = createApp(config);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    // 1. Admin login (session + CSRF).
    const loginRes = await fetch(`${base}/api/v1/admin/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    assert.equal(loginRes.status, 200, `login got ${loginRes.status}`);
    const jar = cookieJar(loginRes);
    const csrf = (await loginRes.json()).data.csrfToken;
    const authed = { cookie: cookieHeader(jar), 'x-csrf-token': csrf };
    step('admin login issues session + CSRF');

    // 2. Upload a real 1x1 PNG.
    const fd = new FormData();
    fd.append('image', new Blob([PNG_1PX], { type: 'image/png' }), 'pixel.png');
    const upRes = await fetch(`${base}/api/v1/admin/uploads`, {
      method: 'POST',
      headers: { cookie: cookieHeader(jar), 'x-csrf-token': csrf },
      body: fd,
    });
    assert.equal(upRes.status, 201, `upload got ${upRes.status}: ${await upRes.clone().text()}`);
    asset = (await upRes.json()).data;
    assert.match(asset.url, /^https:\/\/res\.cloudinary\.com\//, 'secure Cloudinary URL');
    assert.match(asset.publicId, /^bayo-portfolio\//, 'publicId inside own folder');
    assert.equal(asset.width, 1);
    assert.equal(asset.height, 1);
    step(`upload returns secure URL + publicId (${asset.publicId})`);

    // 3. The CDN actually serves the transformed asset.
    const cdn = await fetch(asset.url);
    assert.equal(cdn.status, 200, `cdn got ${cdn.status}`);
    assert.match(cdn.headers.get('content-type') || '', /^image\//, 'served as an image');
    step('CDN serves the image (200, image/*)');

    // 4. Spoofed image rejected by magic bytes.
    const bad = new FormData();
    bad.append('image', new Blob(['nope, not image bytes'], { type: 'image/png' }), 'fake.png');
    const badRes = await fetch(`${base}/api/v1/admin/uploads`, {
      method: 'POST',
      headers: { cookie: cookieHeader(jar), 'x-csrf-token': csrf },
      body: bad,
    });
    assert.equal(badRes.status, 400);
    assert.equal((await badRes.json()).error.code, 'UNSUPPORTED_TYPE');
    step('spoofed image rejected before storage (400)');

    // 5. 5 MB cap enforced.
    const big = new FormData();
    big.append('image', new Blob([Buffer.alloc(6 * 1024 * 1024, 7)], { type: 'image/png' }), 'big.png');
    const bigRes = await fetch(`${base}/api/v1/admin/uploads`, {
      method: 'POST',
      headers: { cookie: cookieHeader(jar), 'x-csrf-token': csrf },
      body: big,
    });
    assert.equal(bigRes.status, 413, `oversize got ${bigRes.status}`);
    assert.equal((await bigRes.json()).error.code, 'FILE_TOO_LARGE');
    step('5 MB size cap enforced (413)');

    // 6. Reference guard: destroy blocked while a project holds the image.
    const createRes = await fetch(`${base}/api/v1/admin/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authed },
      body: JSON.stringify({
        title: 'Live Check Holder',
        shortDescription: 'Reference-guard fixture for the live upload check.',
        category: 'Web App',
        slug: 'live-check-holder',
        media: [{ url: asset.url, publicId: asset.publicId, alt: 'live check' }],
      }),
    });
    assert.equal(createRes.status, 201, `create got ${createRes.status}`);
    const holderId = (await createRes.json()).data.id;

    const guard = await fetch(`${base}/api/v1/admin/uploads?publicId=${encodeURIComponent(asset.publicId)}`, {
      method: 'DELETE',
      headers: authed,
    });
    assert.equal(guard.status, 409, `guard got ${guard.status}`);
    assert.equal((await guard.json()).error.code, 'MEDIA_REFERENCES');
    step('destroy blocked while a project references the image (409)');

    // 7. Approved order: detach the reference, delete the record, destroy asset.
    const detach = await fetch(`${base}/api/v1/admin/projects/${holderId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...authed },
      body: JSON.stringify({
        title: 'Live Check Holder',
        shortDescription: 'Reference-guard fixture for the live upload check.',
        category: 'Web App',
        media: [],
        version: 1,
      }),
    });
    assert.equal(detach.status, 200, `detach got ${detach.status}: ${await detach.clone().text()}`);
    const del = await fetch(`${base}/api/v1/admin/projects/${holderId}?confirm=true`, {
      method: 'DELETE',
      headers: authed,
    });
    assert.equal(del.status, 200, `project delete got ${del.status}: ${await del.clone().text()}`);
    const del2 = await fetch(`${base}/api/v1/admin/uploads?publicId=${encodeURIComponent(asset.publicId)}`, {
      method: 'DELETE',
      headers: authed,
    });
    assert.equal(del2.status, 200, `destroy got ${del2.status}: ${await del2.clone().text()}`);
    assert.equal((await del2.json()).data.deleted, true);
    assetDestroyed = true;
    step('detach -> record delete -> asset destroy, in that order');

    // 8. The asset is gone: probe a transformation that was never fetched
    // before, so Cloudinary's delivery cache cannot mask the deletion.
    const probeUrl = asset.url.replace('/upload/', '/upload/w_1/');
    const gone = await fetch(probeUrl);
    assert.notEqual(gone.status, 200, `destroyed asset still served (status ${gone.status})`);
    step(`CDN no longer serves the destroyed asset (fresh-transform status ${gone.status})`);

    console.log(`LIVE-UPLOAD-CHECK PASSED (${passed} steps)`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await Admin.deleteMany({ email: EMAIL });
    await Project.deleteMany({ slug: 'live-check-holder' });
    await disconnectDb();
    // Never leave an orphaned asset behind, even when a step fails.
    if (asset && !assetDestroyed) {
      try {
        await destroyImage(asset.publicId);
        console.log(`  cleanup: destroyed leftover asset ${asset.publicId}`);
      } catch { /* best effort */ }
    }
  }
}

main()
  .then(() => process.exit(0)) // cloudinary's keep-alive agent would otherwise hold the loop
  .catch((err) => {
    console.error(`LIVE-UPLOAD-CHECK FAILED: ${err?.message ?? err}`);
    process.exit(1);
  });
