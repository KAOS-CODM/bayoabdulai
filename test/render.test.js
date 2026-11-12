// Phase 5 — renderer unit tests (no server, no database).
// Covers escaping, protocol validation, video allowlisting, section order,
// empty/invalid structures, and the Tailwind/Font Awesome class contract:
// the renderer may only emit classes present in the built CSS, because
// Tailwind never scans server-generated HTML.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { escapeHtml, safeHttpUrl, safeMediaUrl, renderInline, renderBlocks } from '../server/render/html.js';
import { renderProjectPage, videoEmbedUrl } from '../server/render/project-page.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const outputCss = fs.readFileSync(path.join(ROOT, 'public/dist/output.css'), 'utf8');
const faCss = fs.readFileSync(path.join(ROOT, 'public/assets/fontawesome/css/all.min.css'), 'utf8');

// CSS identifier escaping: .text-\[10px\], .dark\:bg-slate-800, .gap-1\.5
const cssEscaped = (cls) => cls.replace(/([:[\]/#.])/g, '\\$1');
const hasUtility = (cls) => outputCss.includes(`.${cssEscaped(cls)}`);
// FA6 icons: .fa-name{--fa:"..."} or grouped selectors .fa-name,....
const hasIcon = (name) => faCss.includes(`.${name}{`) || faCss.includes(`.${name},`);

function baseProject(overrides = {}) {
  return {
    _id: '65aa00000000000000000001',
    title: 'Fixture Project',
    slug: 'fixture-project',
    shortDescription: 'A short description of the fixture project.',
    category: 'Web Design',
    status: 'published',
    featured: false,
    displayOrder: 0,
    tags: [],
    role: '',
    duration: '',
    tools: [],
    objectives: [],
    overview: [],
    sections: [],
    media: [],
    links: [],
    seo: { title: '', description: '', canonical: '', image: '', imageAlt: '' },
    version: 1,
    ...overrides,
  };
}

const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

describe('html.js safety primitives', () => {
  it('escapeHtml escapes markup-significant characters', () => {
    assert.equal(
      escapeHtml(`<script>alert("x")</script> & 'y'`),
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;',
    );
  });

  it('safeHttpUrl accepts http(s) and rejects dangerous schemes', () => {
    assert.ok(safeHttpUrl('https://example.com/a?b=1'));
    assert.ok(safeHttpUrl('http://example.com'));
    for (const bad of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      '//evil.example',
      'not a url',
      '',
      null,
    ]) {
      assert.equal(safeHttpUrl(bad), null, `${bad} must be rejected`);
    }
  });

  it('safeMediaUrl allows root-relative paths but rejects protocol-relative', () => {
    assert.equal(safeMediaUrl('/assets/images/x.png'), '/assets/images/x.png');
    assert.ok(safeMediaUrl('https://res.cloudinary.com/dbdtvd1qj/image/upload/v1/a.jpg'));
    assert.equal(safeMediaUrl('//evil.example/x.png'), null);
    assert.equal(safeMediaUrl('/\\evil.example'), null);
    assert.equal(safeMediaUrl('javascript:alert(1)'), null);
  });
});

describe('rich-text rendering', () => {
  it('escapes text nodes and supports nested inline styles', () => {
    const html = renderInline([
      { type: 'bold', content: [{ type: 'text', text: '<b>bold</b>' }] },
      { type: 'italic', content: [{ type: 'text', text: 'i' }] },
      { type: 'underline', content: [{ type: 'text', text: 'u' }] },
      { type: 'code', text: '<code>' },
    ]);
    assert.match(html, /<strong>&lt;b&gt;bold&lt;\/b&gt;<\/strong>/);
    assert.match(html, /<em>i<\/em>/);
    assert.match(html, /<u>u<\/u>/);
    assert.match(html, /<code class="[^"]*">&lt;code&gt;<\/code>/);
    assert.ok(!html.includes('<b>bold</b>'));
  });

  it('drops links with dangerous protocols but keeps safe ones', () => {
    const evil = renderInline([
      { type: 'link', href: 'javascript:alert(1)', content: [{ type: 'text', text: 'click' }] },
    ]);
    assert.equal(evil, 'click'); // inner content survives, anchor is not emitted
    assert.ok(!evil.includes('<a '));

    const data = renderInline([
      { type: 'link', href: 'data:text/html,x', content: [{ type: 'text', text: 'x' }] },
    ]);
    assert.ok(!data.includes('<a '));

    const good = renderInline([
      { type: 'link', href: 'https://example.com', content: [{ type: 'text', text: 'site' }] },
    ]);
    assert.match(good, /<a href="https:\/\/example\.com\/" target="_blank" rel="noopener noreferrer">site<\/a>/);
  });

  it('renders nested bold inside a link', () => {
    const html = renderInline([
      {
        type: 'link',
        href: 'https://example.com',
        content: [
          { type: 'text', text: 'open ' },
          { type: 'bold', content: [{ type: 'text', text: 'now' }] },
        ],
      },
    ]);
    assert.match(html, /<a [^>]*><strong>now<\/strong>.*<\/a>|<a [^>]*>open <strong>now<\/strong><\/a>/);
    assert.ok(html.includes('open <strong>now</strong>'));
  });

  it('drops unknown node and block types safely', () => {
    assert.equal(renderInline([{ type: 'blink', text: 'x' }]), '');
    assert.equal(renderBlocks([{ type: 'iframe', html: '<script>x</script>' }]), '');
    assert.equal(renderBlocks('not-an-array'), '');
    assert.equal(renderBlocks(null), '');
  });

  it('renders ordered lists with explicit numbers (no native markers)', () => {
    const html = renderBlocks([
      { type: 'list', ordered: true, items: [[{ type: 'text', text: 'first' }], [{ type: 'text', text: 'second' }]] },
    ]);
    assert.match(html, /<ol /);
    assert.match(html, />1\.<\/span>/);
    assert.match(html, />2\.<\/span>/);
    assert.ok(html.includes('first'));
  });

  it('renders headings, blockquote and code blocks with escaping', () => {
    const html = renderBlocks([
      { type: 'heading', level: 2, content: [{ type: 'text', text: 'Sub <head>' }] },
      { type: 'blockquote', content: [{ type: 'text', text: 'quoted & safe' }] },
      { type: 'code', code: 'if (a < b) { alert("<x>"); }' },
    ]);
    assert.match(html, /<h3 class="[^"]*">Sub &lt;head&gt;<\/h3>/);
    assert.ok(html.includes('<blockquote class='));
    assert.ok(html.includes('quoted &amp; safe'));
    assert.ok(html.includes('if (a &lt; b) { alert(&quot;&lt;x&gt;&quot;); }'));
    assert.ok(!html.includes('alert("<x>")'));
  });
});

describe('video embed allowlist', () => {
  it('builds embed URLs only for validated ids on approved hosts', () => {
    assert.equal(videoEmbedUrl('youtube', 'dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    assert.equal(videoEmbedUrl('vimeo', '123456789'), 'https://player.vimeo.com/video/123456789');
  });

  it('rejects bad ids, non-numeric vimeo ids and unknown providers', () => {
    assert.equal(videoEmbedUrl('youtube', '"><script>'), null);
    assert.equal(videoEmbedUrl('youtube', '../../evil'), null);
    assert.equal(videoEmbedUrl('vimeo', 'abc123'), null); // vimeo ids must be numeric
    assert.equal(videoEmbedUrl('dailymotion', 'x12345'), null);
    assert.equal(videoEmbedUrl('youtube', 'ab'), null); // below schema minimum
    assert.equal(videoEmbedUrl(undefined, undefined), null);
  });
});

describe('project page template', () => {
  it('renders a complete document with title, description and site shell', () => {
    const html = renderProjectPage(baseProject());
    assert.match(html, /^<!DOCTYPE html>/);
    assert.match(html, /<title>Fixture Project \| Bayo Abdulai Badmus<\/title>/);
    assert.match(html, /<meta name="description" content="A short description/);
    assert.ok(html.includes('/dist/output.css'));
    assert.ok(html.includes('/assets/fontawesome/css/all.min.css'));
    assert.ok(html.includes('/js/theme.js'));
    assert.ok(html.includes('Have a project in mind?'));
    assert.ok(!html.includes('undefined'), 'no raw undefined in output');
  });

  it('uses seo.title for the document title when provided', () => {
    const html = renderProjectPage(baseProject({ seo: { title: 'Better Title', description: 'seo desc' } }));
    assert.match(html, /<title>Better Title \| Bayo Abdulai Badmus<\/title>/);
    assert.match(html, /<meta name="description" content="seo desc"/);
  });

  it('escapes hostile titles in the hero and breadcrumb', () => {
    const html = renderProjectPage(baseProject({ title: '<script>alert(1)</script>' }));
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  });

  it('renders sections in their saved order and numbers TOC + headings alike', () => {
    const html = renderProjectPage(baseProject({
      sections: [
        { type: 'richText', title: 'Zebra Section', blocks: [para('z content')] },
        { type: 'richText', title: 'Aardvark Section', blocks: [para('a content')] },
        { type: 'richText', title: 'Manatee Section', blocks: [para('m content')] },
      ],
    }));
    const z = html.indexOf('Zebra Section');
    const a = html.indexOf('Aardvark Section');
    const m = html.indexOf('Manatee Section');
    assert.ok(z > -1 && a > -1 && m > -1, 'all three sections render');
    assert.ok(z < a && a < m, 'saved order is preserved');
    // TOC numbering matches heading numbering
    assert.match(html, /<span>01<\/span> Zebra Section/);
    assert.match(html, /<span>02<\/span> Aardvark Section/);
    assert.match(html, /<span>03<\/span> Manatee Section/);
    assert.match(html, /<span class="text-purple-600">01<\/span> Zebra Section/);
  });

  it('renders the Overview and Project Goals core sections first', () => {
    const html = renderProjectPage(baseProject({
      overview: [para('overview text')],
      objectives: ['Goal one', 'Goal two'],
      sections: [{ type: 'richText', title: 'Later', blocks: [para('later')] }],
    }));
    assert.match(html, /<span>01<\/span> Project Overview/);
    assert.match(html, /<span>02<\/span> Project Goals/);
    assert.match(html, /<span>03<\/span> Later/);
    assert.match(html, /id="project-overview"/);
    assert.match(html, /id="project-goals"/);
    assert.ok(html.includes('Goal one'));
  });

  it('omits empty optional sections entirely (no empty containers)', () => {
    const html = renderProjectPage(baseProject({
      sections: [
        { type: 'statistics', title: 'No Stats', items: [] },
        { type: 'imageGallery', title: 'No Images', images: [] },
        { type: 'checklist', title: 'No Checks', items: [] },
        { type: 'keyModules', title: 'No Modules', items: [] },
        { type: 'processSteps', title: 'No Steps', steps: [] },
      ],
    }));
    assert.equal((html.match(/<section id="/g) || []).length, 0, 'no content sections rendered');
    assert.ok(!html.includes('No Stats'), 'empty section titles never appear');
    assert.ok(!html.includes('On This Page'), 'no TOC without content');
  });

  it('fails safely on invalid and unknown section structures', () => {
    const html = renderProjectPage(baseProject({
      sections: [
        { type: 'mysteryType', title: 'Mystery', payload: '<script>x</script>' },
        { type: 'checklist', title: 'Broken', items: [] },        // violates min(1)
        { type: 'richText', title: 'Broken Rich', blocks: [] },   // violates min(1)
        { type: 'checklist', title: 'Valid Checks', items: ['keep me'] },
      ],
    }));
    assert.equal((html.match(/<section id="/g) || []).length, 1, 'only the valid section renders');
    assert.ok(html.includes('keep me'));
    assert.ok(!html.includes('Mystery'));
    assert.ok(!html.includes('Broken Rich'));
    assert.ok(!html.includes('<script>x</script>'));
  });

  it('renders project links, omits empty meta cells, and gates the PDF card', () => {
    const noLinks = renderProjectPage(baseProject());
    assert.ok(!noLinks.includes('My Role'), 'empty role cell omitted');
    assert.ok(!noLinks.includes('Timeline'), 'empty duration cell omitted');
    assert.ok(!noLinks.includes('Tools'), 'empty tools cell omitted');
    assert.ok(!noLinks.includes('Project Brief (PDF)'), 'no PDF card without a PDF link');
    assert.ok(!noLinks.includes('Project Links'), 'no links cell without links');

    const withLinks = renderProjectPage(baseProject({
      role: 'Designer',
      duration: '8 weeks',
      tools: ['Figma'],
      links: [
        { label: 'Live site', url: 'https://example.com/live', kind: 'live' },
        { label: 'Brief', url: 'https://example.com/brief.pdf', kind: 'other' },
        { label: 'Bad', url: 'javascript:alert(1)', kind: 'other' },
      ],
    }));
    assert.ok(withLinks.includes('My Role'));
    assert.ok(withLinks.includes('Timeline'));
    assert.ok(withLinks.includes('Figma'));
    assert.match(withLinks, /<a href="https:\/\/example\.com\/live" target="_blank" rel="noopener noreferrer"[^>]*>Live site/);
    assert.ok(withLinks.includes('Project Brief (PDF)'), 'PDF card shown for a .pdf link');
    assert.ok(!withLinks.includes('javascript:'), 'dangerous link dropped');
  });

  it('handles a missing cover image gracefully', () => {
    const html = renderProjectPage(baseProject());
    assert.ok(!html.includes('rounded-3xl bg-white p-4 shadow-lg'), 'no cover card without media');
    assert.ok(!html.includes('undefined'));
  });

  it('renders gallery alt text and captions', () => {
    const html = renderProjectPage(baseProject({
      media: [{ url: 'https://res.cloudinary.com/x/y/upload/v1/cover.jpg', alt: 'Cover alt', caption: 'Cover cap', ratio: '16:10', sort: 0 }],
      sections: [{
        type: 'imageGallery',
        title: 'Gallery',
        images: [
          { url: '/assets/images/one.png', alt: 'First image', caption: 'Caption one', ratio: '4:3' },
          { url: 'https://res.cloudinary.com/x/y/upload/v1/two.jpg', alt: 'Second image' },
        ],
      }],
    }));
    assert.ok(html.includes('alt="Cover alt"'));
    assert.ok(html.includes('alt="First image"'));
    assert.ok(html.includes('Caption one'));
    assert.ok(html.includes('style="aspect-ratio:4/3"'));
    assert.ok(html.includes('style="aspect-ratio:16/10"'), 'cover uses the standard 16:10 presentation');
  });

  it('renders video embeds only for approved providers and shows a fallback otherwise', () => {
    const html = renderProjectPage(baseProject({
      sections: [
        { type: 'videoEmbed', title: 'Demo', provider: 'youtube', videoId: 'dQw4w9WgXcQ', caption: 'Demo video' },
        // Passes the schema id charset but fails the provider-specific rule
        // (vimeo ids are numeric) -> safe fallback box at render time.
        { type: 'videoEmbed', title: 'Bad Demo', provider: 'vimeo', videoId: 'abc123' },
        // Fails schema validation entirely -> section dropped before rendering.
        { type: 'videoEmbed', title: 'Evil', provider: 'youtube', videoId: '"><script>alert(1)</script>' },
      ],
    }));
    assert.ok(html.includes('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"'));
    assert.ok(html.includes('Demo video'));
    assert.ok(html.includes('Video unavailable'), 'invalid embed gets a safe fallback');
    assert.equal((html.match(/<iframe/g) || []).length, 1, 'exactly one iframe — the valid one');
    assert.ok(!html.includes('<script>alert(1)</script>'), 'adversarial videoId never escapes');
  });

  it('marks admin previews noindex with a banner and leaves public pages alone', () => {
    const preview = renderProjectPage(baseProject({ status: 'draft' }), { preview: true });
    assert.ok(preview.includes('<meta name="robots" content="noindex, nofollow">'));
    assert.ok(preview.includes('Preview — draft project, not publicly visible.'));
    assert.ok(preview.includes('/admin#/projects/'));

    const pub = renderProjectPage(baseProject(), { preview: false });
    assert.ok(!pub.includes('noindex'));
    assert.ok(!pub.includes('Preview —'));
  });
});

describe('class coverage against the built CSS', () => {
  const fixtureA = baseProject({
    slug: 'fixture-standard',
    title: 'Standard Project',
    tags: ['Mobile Product Design', 'UX Research'],
    role: 'UI/UX Designer',
    duration: '8 Weeks',
    tools: ['Figma', 'Photoshop'],
    objectives: ['Ship faster', 'Reduce friction'],
    overview: [
      para('Overview paragraph.'),
      { type: 'heading', level: 2, content: [{ type: 'text', text: 'Context' }] },
      { type: 'list', ordered: true, items: [[{ type: 'text', text: 'Point one' }], [{ type: 'text', text: 'Point two' }]] },
      { type: 'blockquote', content: [{ type: 'text', text: 'A quote' }] },
      { type: 'code', code: 'const x = 1;' },
    ],
    media: [{ url: 'https://res.cloudinary.com/x/y/upload/v1/cover.jpg', alt: 'Cover', ratio: '16:10', sort: 0 }],
    links: [
      { label: 'Live', url: 'https://example.com/live', kind: 'live' },
      { label: 'Brief', url: 'https://example.com/brief.pdf', kind: 'other' },
    ],
    sections: [
      { type: 'richText', title: 'Development Process', blocks: [para('How it was built.')] },
      { type: 'imageGallery', title: 'Screens', images: [
        { url: '/assets/images/a.png', alt: 'Screen A', caption: 'A' },
        { url: 'https://res.cloudinary.com/x/y/upload/v1/b.jpg', alt: 'Screen B' },
      ] },
      { type: 'statistics', title: 'Results', items: [
        { value: '35%', label: 'Faster checkout' },
        { value: '4.8/5', label: 'Satisfaction', note: 'post-launch survey' },
      ] },
      { type: 'linkCard', title: 'Prototype', heading: 'Try it', text: 'Interactive demo.', links: [{ label: 'Open prototype', url: 'https://example.com/proto' }] },
      { type: 'richText', title: 'Final Solution', blocks: [para('The result.')] },
    ],
  });

  const fixtureB = baseProject({
    slug: 'fixture-system',
    title: 'System Dashboard Project',
    status: 'published',
    tags: ['Design System'],
    role: 'Product Designer',
    duration: '12 Weeks',
    tools: ['Figma'],
    objectives: ['Unify the product surface'],
    overview: [para('Dashboard overview.')],
    sections: [
      { type: 'beforeAfter', title: 'Old vs New Comparison', before: { url: '/assets/images/old.png', alt: 'Old UI' }, after: { url: '/assets/images/new.png', alt: 'New UI', label: 'Redesign' }, note: 'Side by side.' },
      { type: 'processSteps', title: 'Development Process', steps: [
        { title: 'Audit', description: 'Inventory existing screens.' },
        { title: 'Rebuild', description: 'Component library.', image: { url: '/assets/images/step.png', alt: 'Step shot' } },
      ] },
      { type: 'keyModules', title: 'Key Modules', items: [
        { title: 'Sidebar', description: 'Primary navigation.' },
        { title: 'Table', description: 'Sortable data grid.' },
      ] },
      { type: 'checklist', title: 'Quality Checklist', items: ['Keyboard reachable', 'Screen reader labels'] },
      { type: 'richText', title: 'Final Solution', blocks: [para('Delivered system.')] },
      { type: 'videoEmbed', title: 'Walkthrough', provider: 'vimeo', videoId: '76979871', caption: 'Demo reel' },
    ],
  });

  const htmlA = renderProjectPage(fixtureA);
  const htmlB = renderProjectPage(fixtureB);

  function classTokens(html) {
    const tokens = new Set();
    for (const m of html.matchAll(/class="([^"]*)"/g)) {
      m[1].split(/\s+/).filter(Boolean).forEach((t) => tokens.add(t));
    }
    return [...tokens];
  }

  it('every emitted class exists in public/dist/output.css', () => {
    const missing = [...new Set([...classTokens(htmlA), ...classTokens(htmlB)])]
      .filter((cls) => !cls.startsWith('fa-')) // FA classes live in the FA sheet (covered next)
      .filter((cls) => !hasUtility(cls));
    assert.deepEqual(missing, [], `classes missing from output.css: ${missing.join(', ')}`);
  });

  it('every Font Awesome icon exists in the FA stylesheet', () => {
    const icons = [...new Set([...classTokens(htmlA), ...classTokens(htmlB)])]
      .filter((cls) => cls.startsWith('fa-'));
    const missing = icons.filter((name) => !hasIcon(name));
    assert.deepEqual(missing, [], `icons missing from all.min.css: ${missing.join(', ')}`);
  });

  it('exercises all nine section types across the two fixtures', () => {
    const types = ['richText', 'imageGallery', 'statistics', 'checklist', 'keyModules', 'beforeAfter', 'processSteps', 'linkCard', 'videoEmbed'];
    const all = [...fixtureA.sections, ...fixtureB.sections].map((s) => s.type);
    for (const t of types) assert.ok(all.includes(t), `fixture covers ${t}`);
  });
});
