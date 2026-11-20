import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const apiModuleUrl = new URL('public/js/api.js', ROOT).href;
const adminSource = readFileSync(new URL('public/js/admin.js', ROOT), 'utf8');
const adminHtml = readFileSync(new URL('public/admin.html', ROOT), 'utf8');

const BACKEND = 'https://bayoabdulai-api-j3t8.onrender.com';

function stubDom() {
  const makeElement = () => ({
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  });

  globalThis.document = {
    addEventListener() {},
    createElement: makeElement,
    createDocumentFragment: makeElement,
  };
}

async function loadApi(hostname, tag) {
  // API_BASE is read at module load time, so use a unique query per hostname.
  globalThis.window = { location: { hostname } };
  stubDom();
  return import(`${apiModuleUrl}?test=${encodeURIComponent(tag)}`);
}

describe('frontend backend-aware page URLs', () => {
  it('exports API_BASE and keeps localhost detail URLs root-relative', async () => {
    const { API_BASE, detailPageUrl } = await loadApi('localhost', 'localhost-detail');
    assert.equal(API_BASE, '');
    assert.equal(detailPageUrl('portfolio-website'), '/projects/portfolio-website');
  });

  it('uses the backend origin for production detail URLs', async () => {
    const { API_BASE, detailPageUrl } = await loadApi('bayoabdulai.onrender.com', 'prod-detail');
    assert.equal(API_BASE, BACKEND);
    assert.equal(detailPageUrl('portfolio-website'), `${BACKEND}/projects/portfolio-website`);
  });

  it('keeps localhost preview URLs root-relative', async () => {
    const { previewPageUrl } = await loadApi('127.0.0.1', 'localhost-preview');
    assert.equal(previewPageUrl('draft-project'), '/admin/preview/draft-project');
  });

  it('uses the backend origin for production preview URLs', async () => {
    const { previewPageUrl } = await loadApi('bayoabdulai.onrender.com', 'prod-preview');
    assert.equal(previewPageUrl('draft-project'), `${BACKEND}/admin/preview/draft-project`);
  });

  it('encodes slugs safely in both URL helpers', async () => {
    const { detailPageUrl, previewPageUrl } = await loadApi('bayoabdulai.onrender.com', 'encoding');
    assert.equal(detailPageUrl('a b/c'), `${BACKEND}/projects/a%20b%2Fc`);
    assert.equal(previewPageUrl('a b/c'), `${BACKEND}/admin/preview/a%20b%2Fc`);
  });

  it('project cards use the generated detail URL', async () => {
    const { createProjectCard } = await loadApi('bayoabdulai.onrender.com', 'card');
    const card = createProjectCard({
      title: 'Portfolio Website',
      slug: 'portfolio-website',
      category: 'Web Design',
    });
    assert.equal(card.href, `${BACKEND}/projects/portfolio-website`);
  });
});

describe('admin preview navigation wiring', () => {
  it('imports and uses the shared preview URL helper', () => {
    assert.match(
      adminSource,
      /import\s+\{[^}]*\bAPI_BASE\b[^}]*\bpreviewPageUrl\b[^}]*\}\s+from\s+['"]\.\/api\.js['"]/
    );
    assert.match(adminSource, /href="\$\{previewPageUrl\(p\.slug\)\}"/);
    assert.doesNotMatch(adminSource, /href="\/admin\/preview\//);
    assert.doesNotMatch(adminSource, /const\s+API_BASE\s*=/);
  });

  it('loads admin.js as an ES module', () => {
    assert.match(adminHtml, /<script\s+type="module"\s+src="\/js\/admin\.js"><\/script>/);
  });
});
