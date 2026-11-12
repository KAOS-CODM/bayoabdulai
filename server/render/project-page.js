// Reusable server-rendered project detail template (Phase 5).
// Visual foundation: public/fast-food-delivery-app.html — one renderer, many
// projects. Every class name emitted here exists in the built
// public/dist/output.css (asserted by test/render.test.js class coverage),
// because Tailwind only scans public/*.html and public/*.js.

import {
  escapeHtml, escapeAttr, safeHttpUrl, safeMediaUrl, renderBlocks,
} from './html.js';
import { blockSchema, sectionSchema } from '../validation/schemas.js';

const SITE_NAME = 'Bayo Abdulai Badmus';

// Whitelist mapping for stored media ratios -> CSS aspect-ratio values.
// 'auto' and unknown values omit the style (never interpolate raw data).
const RATIO_STYLES = {
  '16:10': '16/10',
  '4:3': '4/3',
  '3:4': '3/4',
  '1:1': '1/1',
  '9:16': '9/16',
};

// Verified against public/fast-food-delivery-app.html (same icon set).
const STAT_ICONS = ['fa-arrow-trend-up', 'fa-clock', 'fa-star', 'fa-rotate'];

const TAG_ICON_RULES = [
  [/mobile|app|ios|android|phone/i, 'fa-mobile-screen-button'],
  [/shop|cart|commerce|order|food|delivery|payment/i, 'fa-cart-shopping'],
  [/research|ux|usability|analytics|data/i, 'fa-magnifying-glass-chart'],
];
const DEFAULT_TAG_ICON = 'fa-layer-group';

// ---------------------------------------------------------------------------
// Video embeds: strict provider allowlist, validated ids, fixed embed hosts.
// Invalid entries never produce an iframe (safe fallback is rendered instead).
// ---------------------------------------------------------------------------

export function videoEmbedUrl(provider, videoId) {
  if (typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{5,30}$/.test(videoId)) return null;
  if (provider === 'youtube') return `https://www.youtube-nocookie.com/embed/${videoId}`;
  if (provider === 'vimeo') {
    // Vimeo ids are numeric; anything else (even schema-legal) is rejected.
    if (!/^\d{5,12}$/.test(videoId)) return null;
    return `https://player.vimeo.com/video/${videoId}`;
  }
  return null;
}

function slugify(title, usedIds) {
  const base = String(title).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
  let id = base;
  let n = 2;
  while (usedIds.has(id)) id = `${base}-${n++}`;
  usedIds.add(id);
  return id;
}

function ratioStyle(ratio) {
  return RATIO_STYLES[ratio] ? ` style="aspect-ratio:${RATIO_STYLES[ratio]}"` : '';
}

function imageTag(url, alt, ratio, { eager = false, rounded = 'rounded-2xl' } = {}) {
  const src = safeMediaUrl(url);
  if (!src) return '';
  const loading = eager ? 'fetchpriority="high"' : 'loading="lazy"';
  return `<img src="${escapeAttr(src)}" alt="${escapeHtml(alt || '')}"${ratioStyle(ratio)} class="w-full ${rounded} object-cover" ${loading} decoding="async">`;
}

function figureHtml(img, { eager = false } = {}) {
  const src = safeMediaUrl(img && img.url);
  if (!src) return '';
  const caption = img.caption && String(img.caption).trim()
    ? `<figcaption class="mt-2 text-[10px] text-slate-500 dark:text-slate-400">${escapeHtml(img.caption)}</figcaption>`
    : '';
  return `<figure>${imageTag(src, img.alt, img.ratio, { eager })}${caption}</figure>`;
}

// Bullet list shared by the checklist section and the Project Goals section.
function checklistHtml(items) {
  const lis = items.map((text) => `
    <li class="flex gap-2">
      <i class="fa-solid fa-check mt-0.5 text-purple-600"></i>
      <span>${escapeHtml(text)}</span>
    </li>`).join('');
  return `<ul class="mt-3 space-y-2.5 text-[11px] leading-5 text-slate-600 dark:text-slate-300">${lis}</ul>`;
}

// ---------------------------------------------------------------------------
// Section renderers — one per approved type. Each returns '' when it has no
// valid content, so optional/empty data never creates an empty container.
// ---------------------------------------------------------------------------

const SECTION_RENDERERS = {
  richText(section) {
    return renderBlocks(section.blocks);
  },

  imageGallery(section) {
    const figures = (Array.isArray(section.images) ? section.images : [])
      .map((img) => figureHtml(img))
      .filter(Boolean);
    if (!figures.length) return '';
    if (figures.length === 1) return `<div class="mt-4">${figures[0]}</div>`;
    return `<div class="mt-4 grid gap-6 md:grid-cols-2">${figures.join('')}</div>`;
  },

  statistics(section) {
    const items = (Array.isArray(section.items) ? section.items : [])
      .filter((it) => it && it.value && it.label);
    if (!items.length) return '';
    const rows = items.map((it, i) => {
      const note = it.note
        ? `<p class="text-[9px] text-slate-400">${escapeHtml(it.note)}</p>`
        : '';
      return `
        <div class="flex items-center gap-3">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-50 text-purple-600 dark:bg-purple-900/30">
            <i class="fa-solid ${STAT_ICONS[i % STAT_ICONS.length]} text-sm"></i>
          </span>
          <div>
            <p class="text-lg font-extrabold">${escapeHtml(it.value)}</p>
            <p class="text-[10px] text-slate-500 dark:text-slate-400">${escapeHtml(it.label)}</p>
            ${note}
          </div>
        </div>`;
    }).join('');
    return `<div class="mt-4 space-y-4">${rows}</div>`;
  },

  checklist(section) {
    const items = (Array.isArray(section.items) ? section.items : [])
      .filter((t) => typeof t === 'string' && t.trim());
    return items.length ? checklistHtml(items) : '';
  },

  keyModules(section) {
    const items = (Array.isArray(section.items) ? section.items : [])
      .filter((it) => it && it.title);
    if (!items.length) return '';
    const cards = items.map((it) => `
      <div class="rounded-2xl bg-[#f0ebff] p-5 dark:bg-[#211d2d]">
        <p class="text-xs font-bold">${escapeHtml(it.title)}</p>
        ${it.description
          ? `<p class="mt-2 text-[11px] leading-5 text-slate-600 dark:text-slate-300">${escapeHtml(it.description)}</p>`
          : ''}
      </div>`).join('');
    return `<div class="mt-4 grid gap-5 sm:grid-cols-2">${cards}</div>`;
  },

  beforeAfter(section) {
    const sides = [];
    if (section.before && section.before.url) {
      sides.push({ img: section.before, fallback: 'Before' });
    }
    if (section.after && section.after.url) {
      sides.push({ img: section.after, fallback: 'After' });
    }
    const valid = sides.filter((s) => safeMediaUrl(s.img.url));
    if (!valid.length) return '';
    const rendered = valid.map((s) => `
      <div>
        <span class="rounded-full bg-purple-50 px-3 py-1.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">${escapeHtml(s.img.label || s.fallback)}</span>
        <div class="mt-3">${imageTag(s.img.url, s.img.alt, '16:10')}</div>
      </div>`).join('');
    const wrapper = valid.length === 2
      ? '<div class="mt-4 grid gap-6 md:grid-cols-2">'
      : '<div class="mt-4">';
    const note = section.note
      ? `<p class="mt-3 text-xs leading-6 text-slate-600 dark:text-slate-300">${escapeHtml(section.note)}</p>`
      : '';
    return `${wrapper}${rendered}</div>${note}`;
  },

  processSteps(section) {
    const steps = (Array.isArray(section.steps) ? section.steps : [])
      .filter((st) => st && st.title);
    if (!steps.length) return '';
    const lis = steps.map((st, i) => {
      const img = st.image && st.image.url
        ? `<div class="mt-3">${imageTag(st.image.url, st.image.alt, '16:10', { rounded: 'rounded-xl' })}</div>`
        : '';
      return `
        <li class="rounded-2xl border border-slate-100 p-4 dark:border-slate-800">
          <div class="flex items-start gap-3">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-xs font-bold text-white">${i + 1}</span>
            <div>
              <p class="text-xs font-bold">${escapeHtml(st.title)}</p>
              ${st.description
                ? `<p class="mt-1 text-[11px] leading-5 text-slate-600 dark:text-slate-300">${escapeHtml(st.description)}</p>`
                : ''}
            </div>
          </div>
          ${img}
        </li>`;
    }).join('');
    return `<ol class="mt-4 space-y-4">${lis}</ol>`;
  },

  linkCard(section) {
    const links = (Array.isArray(section.links) ? section.links : [])
      .map((l) => {
        const href = l && safeHttpUrl(l.url);
        return href && l.label ? { href, label: l.label } : null;
      })
      .filter(Boolean);
    if (!links.length) return '';
    const heading = section.heading
      ? `<p class="text-xs font-bold">${escapeHtml(section.heading)}</p>`
      : '';
    const text = section.text
      ? `<p class="mt-2 text-[11px] leading-5 text-slate-600 dark:text-slate-300">${escapeHtml(section.text)}</p>`
      : '';
    const anchors = links.map((l) => `
      <a href="${escapeAttr(l.href)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-600 hover:underline">
        ${escapeHtml(l.label)}
        <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
      </a>`).join('');
    return `
      <div class="mt-4 rounded-2xl bg-[#f0ebff] p-5 dark:bg-[#211d2d]">
        ${heading}${text}
        <div class="mt-3 flex flex-wrap gap-4">${anchors}</div>
      </div>`;
  },

  videoEmbed(section) {
    const src = videoEmbedUrl(section.provider, section.videoId);
    const caption = section.caption
      ? `<p class="mt-2 text-[10px] text-slate-500 dark:text-slate-400">${escapeHtml(section.caption)}</p>`
      : '';
    if (!src) {
      // Report server-side; visitors only ever see a safe fallback box.
      console.warn(`[render] invalid video embed omitted (provider=${String(section.provider).slice(0, 40)})`);
      return `
        <div class="mt-4 rounded-2xl bg-[#f0ebff] p-5 text-center dark:bg-[#211d2d]">
          <p class="text-[11px] font-bold">Video unavailable</p>
        </div>${caption}`;
    }
    return `
      <div class="mt-4">
        <div style="aspect-ratio:16/9" class="overflow-hidden rounded-2xl">
          <iframe src="${escapeAttr(src)}" title="${escapeAttr(section.caption || 'Project video')}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" class="h-full w-full border-0"></iframe>
        </div>${caption}
      </div>`;
  },
};

// ---------------------------------------------------------------------------
// Content assembly: Overview (blocks) -> Project Goals (objectives) ->
// sections in their saved order. Numbers are contiguous across rendered
// sections so the TOC always matches the headings.
// ---------------------------------------------------------------------------

function validBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .map((b) => blockSchema.safeParse(b))
    .filter((r) => r.success)
    .map((r) => r.data);
}

function buildSections(project) {
  const toc = [];
  const parts = [];
  const usedIds = new Set();
  let n = 0;
  const nextNum = () => String(++n).padStart(2, '0');

  const overviewBlocks = validBlocks(project.overview);
  if (overviewBlocks.length) {
    const num = nextNum();
    const id = 'project-overview';
    usedIds.add(id);
    toc.push({ id, num, title: 'Project Overview' });
    parts.push(`<section id="${id}" class="scroll-mt-24">
              <h2 class="text-base font-bold"><span class="text-purple-600">${num}</span> Project Overview</h2>
              ${renderBlocks(overviewBlocks)}
            </section>`);
  }

  const objectives = (Array.isArray(project.objectives) ? project.objectives : [])
    .filter((t) => typeof t === 'string' && t.trim());
  if (objectives.length) {
    const num = nextNum();
    const id = 'project-goals';
    usedIds.add(id);
    toc.push({ id, num, title: 'Project Goals' });
    parts.push(`<section id="${id}" class="scroll-mt-24">
              <h2 class="text-base font-bold"><span class="text-purple-600">${num}</span> Project Goals</h2>
              ${checklistHtml(objectives)}
            </section>`);
  }

  (Array.isArray(project.sections) ? project.sections : []).forEach((raw, idx) => {
    const parsed = sectionSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn(`[render] invalid section skipped (${String(raw && raw.type).slice(0, 30)}): ${parsed.error.issues[0]?.message ?? 'invalid'}`);
      return;
    }
    const section = parsed.data;
    const render = SECTION_RENDERERS[section.type];
    const body = render ? render(section) : '';
    if (!body) return; // nothing valid -> no empty container, no number consumed
    const num = nextNum();
    // slugify() also registers the id, so untitled ids stay collision-free.
    const id = slugify(section.title || `section-${idx + 1}`, usedIds);
    if (section.title) toc.push({ id, num, title: section.title });
    parts.push(`<section id="${escapeAttr(id)}" class="scroll-mt-24">
              ${section.title
                ? `<h2 class="text-base font-bold"><span class="text-purple-600">${num}</span> ${escapeHtml(section.title)}</h2>`
                : ''}
              ${body}
            </section>`);
  });

  return { toc, parts };
}

// ---------------------------------------------------------------------------
// Page shell: head, navbar, hero, meta card, sidebar/TOC, sections, CTA,
// footer, scripts — mirroring fast-food-delivery-app.html with root-relative
// asset URLs (the static pages live at the site root; this page does not).
// ---------------------------------------------------------------------------

export function renderProjectPage(project, options = {}) {
  const { preview = false } = options;
  const p = project || {};
  const title = String(p.title || '').trim();
  const shortDescription = String(p.shortDescription || '').trim();
  const category = String(p.category || '').trim();

  const { toc, parts } = buildSections(p);

  // ---- document head ------------------------------------------------------
  const seoBase = (p.seo && p.seo.title ? String(p.seo.title).trim() : '') || title;
  const docTitle = seoBase.endsWith(SITE_NAME) ? seoBase : `${seoBase} | ${SITE_NAME}`;
  const metaDescription = (p.seo && p.seo.description ? String(p.seo.description).trim() : '') || shortDescription;
  const robots = preview ? '\n  <meta name="robots" content="noindex, nofollow">' : '';

  // ---- hero ---------------------------------------------------------------
  const media = (Array.isArray(p.media) ? p.media : [])
    .slice()
    .sort((a, b) => (a.sort || 0) - (b.sort || 0));
  const cover = media.find((m) => m && safeMediaUrl(m.url));

  const tags = (Array.isArray(p.tags) ? p.tags : [])
    .filter((t) => typeof t === 'string' && t.trim())
    .slice(0, 12);
  const tagPills = tags.map((tag) => {
    const icon = TAG_ICON_RULES.find(([re]) => re.test(tag))?.[1] ?? DEFAULT_TAG_ICON;
    return `<span class="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[10px] font-medium text-slate-700 shadow-sm dark:bg-[#1b1824] dark:text-slate-300">
                <i class="fa-solid ${icon} text-purple-600"></i>
                ${escapeHtml(tag)}
              </span>`;
  }).join('\n              ');

  const heroGridClass = 'mt-8 grid items-center gap-8 lg:grid-cols-[1.05fr_.95fr]';
  const heroGridStyle = cover ? '' : ' style="grid-template-columns:1fr"';

  // ---- meta card (only non-empty cells) -----------------------------------
  const projectLinks = (Array.isArray(p.links) ? p.links : [])
    .map((l) => {
      const href = l && safeHttpUrl(l.url);
      return href && l.label ? { href, label: l.label, kind: l.kind } : null;
    })
    .filter(Boolean);

  const cells = [];
  if (shortDescription) {
    cells.push(`
          <div class="sm:col-span-2 lg:col-span-1">
            <p class="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">
              <i class="fa-solid fa-circle-info text-purple-600"></i>
              Project Overview
            </p>
            <p class="mt-2 text-[11px] font-medium leading-5 text-slate-600 dark:text-slate-300">${escapeHtml(shortDescription)}</p>
          </div>`);
  }
  if (p.role) {
    cells.push(`
          <div>
            <p class="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">
              <i class="fa-solid fa-user text-purple-600"></i>
              My Role
            </p>
            <p class="mt-2 text-[11px] font-medium leading-5 text-slate-600 dark:text-slate-300">${escapeHtml(p.role)}</p>
          </div>`);
  }
  if (p.duration) {
    cells.push(`
          <div>
            <p class="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">
              <i class="fa-solid fa-clock text-purple-600"></i>
              Timeline
            </p>
            <p class="mt-2 text-[11px] font-medium leading-5 text-slate-600 dark:text-slate-300">${escapeHtml(p.duration)}</p>
          </div>`);
  }
  const tools = (Array.isArray(p.tools) ? p.tools : []).filter((t) => typeof t === 'string' && t.trim());
  if (tools.length) {
    cells.push(`
          <div>
            <p class="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">
              <i class="fa-solid fa-screwdriver-wrench text-purple-600"></i>
              Tools
            </p>
            <p class="mt-2 text-[11px] font-medium leading-5 text-slate-600 dark:text-slate-300">${escapeHtml(tools.join(', '))}</p>
          </div>`);
  }
  if (projectLinks.length) {
    const anchors = projectLinks.map((l) => `
              <a href="${escapeAttr(l.href)}" target="_blank" rel="noopener noreferrer" class="text-[11px] font-medium text-purple-600 hover:underline">${escapeHtml(l.label)} <i class="fa-solid fa-arrow-up-right-from-square text-[7px]"></i></a>`).join('');
    cells.push(`
          <div>
            <p class="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">
              <i class="fa-solid fa-link text-purple-600"></i>
              Project Links
            </p>
            <div class="mt-2 flex flex-col gap-1">${anchors}
            </div>
          </div>`);
  }

  // ---- sidebar: TOC + optional PDF brief -----------------------------------
  const pdfLink = projectLinks.find((l) => /\.pdf($|\?|#)/i.test(l.href));
  const tocHtml = toc.map((entry) => `
                <a href="#${escapeAttr(entry.id)}"><span>${entry.num}</span> ${escapeHtml(entry.title)}</a>`).join('');
  const tocBlock = toc.length ? `
            <p class="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">
              On This Page
            </p>

            <nav id="toc" class="mt-4 flex flex-col text-[11px]">${tocHtml}
            </nav>` : '';
  const pdfBlock = pdfLink ? `
            <div class="mt-6 rounded-2xl border border-slate-100 bg-white p-4 text-center shadow-sm dark:border-slate-800 dark:bg-[#1b1824]">
              <span class="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-purple-50 text-purple-600 dark:bg-purple-900/30">
                <i class="fa-solid fa-download text-sm"></i>
              </span>
              <p class="mt-3 text-[11px] font-bold">Project Brief (PDF)</p>
              <a href="${escapeAttr(pdfLink.href)}" target="_blank" rel="noopener noreferrer" class="mt-1 inline-block text-[10px] font-semibold text-purple-600 hover:underline">Download</a>
            </div>` : '';
  const hasAside = Boolean(tocBlock || pdfBlock);
  const contentGridClass = 'container-site grid gap-10 lg:grid-cols-[210px_1fr]';
  const contentGridStyle = hasAside ? '' : ' style="grid-template-columns:1fr"';

  const sectionsBody = parts.length
    ? parts.join('\n\n          ')
    : `<p class="text-xs leading-6 text-slate-600 dark:text-slate-300">This project has no content sections yet.</p>`;

  // ---- preview banner (admin preview only) ---------------------------------
  const previewBanner = preview ? `
  <div style="position:fixed;bottom:0;left:0;right:0;z-index:60;background:#5420ff;color:#fff;padding:10px 16px;text-align:center;font-size:12px;font-weight:600;">
    Preview — ${escapeHtml(String(p.status || 'draft'))} project, not publicly visible.
    <a href="/admin#/projects/${escapeAttr(String(p._id || ''))}" style="color:#fff;text-decoration:underline;">Back to editor</a>
  </div>` : '';

  return `<!DOCTYPE html>
<html lang="en" class="scroll-smooth">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>${escapeHtml(docTitle)}</title>
  <meta name="description" content="${escapeHtml(metaDescription)}">${robots}

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link
    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
    rel="stylesheet"
  >

  <link href="/assets/fontawesome/css/all.min.css" rel="stylesheet">
  <link href="/dist/output.css" rel="stylesheet">
</head>

<body class="bg-white text-slate-900 transition-colors duration-300 dark:bg-[#111018] dark:text-white">

  <!-- NAVBAR -->
  <header class="absolute inset-x-0 top-0 z-50">
    <div class="container-site pt-5">

      <nav
        class="flex h-12 items-center justify-between rounded-full
               bg-white/80 px-5 shadow-sm backdrop-blur-md
               dark:bg-[#1b1824]/90"
      >

        <!-- Logo -->
        <a
          href="/"
          class="flex items-center gap-1.5 text-sm font-bold tracking-tight text-slate-900 dark:text-white"
        >
          <img
            src="/assets/images/bayo-mark.svg"
            alt=""
            class="h-5 w-5"
          >

          <span>Bayo.</span>
        </a>

        <!-- Navigation -->
        <div class="hidden items-center gap-7 text-[11px] font-medium md:flex">
          <a href="/" class="text-slate-500 transition hover:text-purple-600 dark:text-slate-400 dark:hover:text-purple-400">Home</a>
          <a href="/about" class="text-slate-500 transition hover:text-purple-600 dark:text-slate-400 dark:hover:text-purple-400">About</a>
          <a href="/work" class="text-purple-600 dark:text-purple-400">Work</a>
          <a href="/resume" class="text-slate-500 transition hover:text-purple-600 dark:text-slate-400 dark:hover:text-purple-400">Resume</a>
          <a href="/contact" class="text-slate-500 transition hover:text-purple-600 dark:text-slate-400 dark:hover:text-purple-400">Contact</a>
        </div>

        <!-- Theme + CTA -->
        <div class="flex items-center gap-2">

          <button
            id="themeToggle"
            type="button"
            aria-label="Toggle theme"
            class="flex h-7 w-12 items-center rounded-full bg-slate-100 p-1 dark:bg-slate-700"
          >
            <span
              id="themeKnob"
              class="flex h-5 w-5 translate-x-0 items-center justify-center rounded-full bg-white text-[11px] shadow-sm transition-transform dark:translate-x-5"
            >
              <i class="fa-solid fa-sun"></i>
            </span>
          </button>

          <a
            href="/contact"
            class="rounded-full bg-purple-600 px-4 py-2 text-[10px] font-semibold text-white transition hover:bg-purple-700"
          >
            Let's Talk
          </a>

          <!-- Hamburger (mobile) -->
          <button
            id="menuToggle"
            type="button"
            aria-label="Open menu"
            aria-expanded="false"
            aria-controls="mobileMenu"
            class="flex h-7 w-7 flex-col items-center justify-center gap-[5px] rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 md:hidden"
          >
            <span class="h-[2px] w-4 rounded-full bg-slate-900 dark:bg-white"></span>
            <span class="h-[2px] w-4 rounded-full bg-slate-900 dark:bg-white"></span>
            <span class="h-[2px] w-4 rounded-full bg-slate-900 dark:bg-white"></span>
          </button>

        </div>
      </nav>

      <!-- Mobile menu -->
      <div
        id="mobileMenu"
        class="mt-3 hidden rounded-[24px] border border-slate-100 bg-white/95 p-3 shadow-lg backdrop-blur-md dark:border-slate-800 dark:bg-[#1b1824]/95 md:hidden"
      >
        <div class="flex flex-col gap-1">
          <a href="/" class="rounded-full px-4 py-2.5 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-purple-600 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-purple-400">Home</a>
          <a href="/about" class="rounded-full px-4 py-2.5 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-purple-600 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-purple-400">About</a>
          <a href="/work" class="rounded-full bg-purple-50 px-4 py-2.5 text-xs font-medium text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">Work</a>
          <a href="/resume" class="rounded-full px-4 py-2.5 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-purple-600 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-purple-400">Resume</a>
          <a href="/contact" class="rounded-full px-4 py-2.5 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-purple-600 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-purple-400">Contact</a>
        </div>
      </div>
    </div>
  </header>

  <main>
${previewBanner}

    <!-- HERO -->
    <section class="bg-[#eee9ff] pb-12 pt-28 dark:bg-[#211d2d]">

      <div class="container-site">

        <!-- Breadcrumb -->
        <nav class="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
          <a href="/" class="transition hover:text-purple-600">Home</a>
          <i class="fa-solid fa-chevron-right text-[7px] text-slate-400"></i>
          <a href="/work" class="transition hover:text-purple-600">Work</a>
          <i class="fa-solid fa-chevron-right text-[7px] text-slate-400"></i>
          <span class="font-medium text-purple-600">${escapeHtml(title)}</span>
        </nav>

        <div class="${heroGridClass}"${heroGridStyle}>

          <div>

            ${category ? `<p class="text-[10px] tracking-wide text-slate-500 dark:text-slate-400">${escapeHtml(category)}</p>` : ''}

            <h1 class="mt-3 max-w-md text-3xl font-extrabold leading-tight sm:text-4xl">
              ${escapeHtml(title)}
            </h1>

            ${tags.length ? `<!-- Tag pills -->
            <div class="mt-5 flex flex-wrap gap-2">
              ${tagPills}
            </div>` : ''}

          </div>

          ${cover ? `
          <!-- Cover -->
          <div class="rounded-3xl bg-white p-4 shadow-lg dark:bg-[#1b1824]">
            ${imageTag(cover.url, cover.alt || `${title} cover image`, cover.ratio || '16:10', { eager: true, rounded: 'rounded-xl' })}
          </div>` : ''}

        </div>

      </div>

    </section>

    <!-- META CARD -->
    ${cells.length ? `
    <section class="bg-white py-10 dark:bg-[#111018]">

      <div class="container-site">

        <div class="grid gap-6 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#1b1824] sm:grid-cols-2 lg:grid-cols-5">${cells.join('')}

        </div>

      </div>

    </section>` : ''}

    <!-- CONTENT + SIDEBAR -->
    <section class="bg-white pb-16 dark:bg-[#111018]">

      <div class="${contentGridClass}"${contentGridStyle}>

        ${hasAside ? `
        <!-- ON THIS PAGE -->
        <aside class="hidden lg:block">
          <div class="sticky top-24">${tocBlock}${pdfBlock}

          </div>
        </aside>` : ''}

        <!-- SECTIONS -->
        <div class="space-y-14">

          ${sectionsBody}

          <!-- CTA -->

          <div class="flex flex-col items-start justify-between gap-5 rounded-3xl bg-[#5420ff] p-7 text-white md:flex-row md:items-center">

            <div class="flex items-center gap-4">
              <span class="h-11 w-11 shrink-0 rounded-full bg-white"></span>

              <div>
                <p class="text-base font-bold">Have a project in mind?</p>
                <p class="mt-1 text-xs text-white/70">
                  I'm currently available for new opportunities and exciting projects.
                </p>
              </div>
            </div>

            <a
              href="/contact"
              class="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-semibold text-purple-700 transition hover:bg-purple-50"
            >
              Let's Work Together
              <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
            </a>

          </div>

        </div>

      </div>

    </section>

  </main>

  <!-- FOOTER -->
  <footer class="bg-[#5420ff] py-10 text-white">

    <div class="container-site">

      <div class="grid gap-10 md:grid-cols-[1.2fr_1fr_1fr_1fr]">

        <div>
          <h2 class="text-lg font-bold">Bayo.</h2>

          <p class="mt-3 max-w-xs text-xs leading-5 text-white/70">
            Product designer focused on creating meaningful digital
            experiences.
          </p>

          <div class="mt-5 flex gap-3">
            <a href="https://www.linkedin.com/in/legendinho/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" class="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[11px] transition hover:bg-white/20"><i class="fa-brands fa-linkedin-in"></i></a>
            <a href="https://x.com/lifeoflegendino?s=11" target="_blank" rel="noopener noreferrer" aria-label="X" class="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[11px] transition hover:bg-white/20"><i class="fa-brands fa-x-twitter"></i></a>
            <a href="https://www.instagram.com/legendinho_histiboyo/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" class="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[11px] transition hover:bg-white/20"><i class="fa-brands fa-instagram"></i></a>
            <a href="https://www.facebook.com/Legendinho/" target="_blank" rel="noopener noreferrer" aria-label="Facebook" class="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[11px] transition hover:bg-white/20"><i class="fa-brands fa-facebook"></i></a>
          </div>
        </div>


        <div>
          <h3 class="text-xs font-bold">Navigation</h3>

          <div class="mt-4 flex flex-col gap-2 text-[10px] text-white/70">
            <a href="/">Home</a>
            <a href="/about">About</a>
            <a href="/work">Work</a>
            <a href="/resume">Resume</a>
            <a href="/contact">Contact</a>
          </div>
        </div>


        <div>
          <h3 class="text-xs font-bold">Services</h3>

          <div class="mt-4 flex flex-col gap-2 text-[10px] text-white/70">
            <span>UI/UX Design</span>
            <span>Product Design</span>
            <span>Design Systems</span>
            <span>Prototyping</span>
          </div>
        </div>


        <div>
          <h3 class="text-xs font-bold">Contact</h3>

          <div class="mt-4 flex flex-col gap-2 text-[10px] text-white/70">
            <a href="mailto:badmusabdulaibayo@gmail.com">badmusabdulaibayo@gmail.com</a>
            <span>Abuja, Nigeria</span>
            <span>Available for work</span>
          </div>
        </div>

      </div>

      <div class="mt-10 border-t border-white/10 pt-5 text-[9px] text-white/50">
        &copy; 2026 Bayo Abdulai Badmus. All rights reserved.
      </div>

    </div>
  </footer>

  <script src="/js/theme.js"></script>
  <script src="/js/nav.js"></script>
${toc.length ? `
  <!-- TOC scroll-spy -->
  <script>
    (function () {
      var links = Array.prototype.slice.call(document.querySelectorAll("#toc a"));
      var sections = links
        .map(function (link) {
          return document.querySelector(link.getAttribute("href"));
        })
        .filter(Boolean);

      if (!("IntersectionObserver" in window) || !sections.length) return;

      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;

            links.forEach(function (link) {
              var active = link.getAttribute("href") === "#" + entry.target.id;
              link.classList.toggle("active", active);
            });
          });
        },
        { rootMargin: "-15% 0px -70% 0px", threshold: 0 }
      );

      sections.forEach(function (section) {
        observer.observe(section);
      });
    })();
  </script>` : ''}
</body>
</html>`;
}
