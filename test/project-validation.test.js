import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectCreateSchema, projectUpdateSchema } from '../server/validation/schemas.js';

const minimal = { title: 'My Project', shortDescription: 'Short description.', category: 'Web App' };

test('create schema applies safe defaults', () => {
  const r = projectCreateSchema.parse(minimal);
  assert.equal(r.status, 'draft');
  assert.equal(r.featured, false);
  assert.equal(r.displayOrder, 0);
  assert.deepEqual(r.sections, []);
  assert.deepEqual(r.overview, []);
  assert.deepEqual(r.tags, []);
});

test('rejects invalid slug format', () => {
  const r = projectCreateSchema.safeParse({ ...minimal, slug: 'Not A Slug!' });
  assert.equal(r.success, false);
});

test('rejects unknown section types', () => {
  const r = projectCreateSchema.safeParse({ ...minimal, sections: [{ type: 'hologram' }] });
  assert.equal(r.success, false);
});

test('rejects unsafe link URLs', () => {
  const r = projectCreateSchema.safeParse({ ...minimal, links: [{ label: 'x', url: 'javascript:alert(1)' }] });
  assert.equal(r.success, false);
});

test('video embeds only allow approved providers', () => {
  const bad = projectCreateSchema.safeParse({
    ...minimal,
    sections: [{ type: 'videoEmbed', provider: 'dailymotion', videoId: 'abc12345' }],
  });
  assert.equal(bad.success, false);

  const good = projectCreateSchema.safeParse({
    ...minimal,
    sections: [{ type: 'videoEmbed', provider: 'youtube', videoId: 'dQw4w9WgXcQ' }],
  });
  assert.equal(good.success, true);
});

test('media accepts root-relative asset paths but not arbitrary strings', () => {
  const ok = projectCreateSchema.safeParse({
    ...minimal,
    media: [{ url: '/assets/images/work/fast-food/hero.png', alt: 'hero' }],
  });
  assert.equal(ok.success, true);

  const bad = projectCreateSchema.safeParse({ ...minimal, media: [{ url: 'evil' }] });
  assert.equal(bad.success, false);
});

test('rejects content nested beyond the depth limit', () => {
  let deep = { type: 'text', text: 'bottom' };
  for (let i = 0; i < 20; i += 1) deep = { type: 'bold', content: [deep] };
  const r = projectCreateSchema.safeParse({
    ...minimal,
    overview: [{ type: 'paragraph', content: [deep] }],
  });
  assert.equal(r.success, false);
});

test('update schema requires version and preserves status when omitted', () => {
  const r = projectUpdateSchema.safeParse({ ...minimal, version: 3 });
  assert.equal(r.success, true);
  assert.equal(r.data.status, undefined); // omitted => preserved server-side

  const noVersion = projectUpdateSchema.safeParse(minimal);
  assert.equal(noVersion.success, false);
});
