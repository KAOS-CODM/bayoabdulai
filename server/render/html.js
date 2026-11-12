// Safe HTML building blocks for server-rendered project pages (Phase 5).
// Every project field is untrusted: strings are escaped, URLs are
// protocol-checked, unknown structures are dropped, and raw HTML from data
// is never emitted (no innerHTML-equivalent shortcuts).

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const escapeAttr = escapeHtml;

// http(s) only. Rejects javascript:, data:, vbscript:, protocol-relative //,
// and anything URL cannot parse. Returns the normalized href or null.
export function safeHttpUrl(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > 2048) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}

// Media URLs: root-relative paths (/assets/...) or http(s). Protocol-relative
// (//evil.example) and backslash tricks are rejected.
export function safeMediaUrl(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > 2048) return null;
  if (raw.startsWith('/')) {
    if (raw.startsWith('//') || raw.includes('\\')) return null;
    return raw;
  }
  return safeHttpUrl(raw);
}

// ---------------------------------------------------------------------------
// Inline rich-text nodes -> safe HTML (recursive, depth-capped)
// ---------------------------------------------------------------------------

const MAX_INLINE_DEPTH = 12;

export function renderInline(nodes, depth = 0) {
  if (!Array.isArray(nodes) || depth > MAX_INLINE_DEPTH) return '';
  return nodes.map((node) => {
    if (!node || typeof node !== 'object') return '';
    switch (node.type) {
      case 'text':
        return escapeHtml(node.text);
      case 'code':
        return `<code class="rounded bg-slate-100 px-1 py-0.5 text-[11px] dark:bg-slate-700">${escapeHtml(node.text)}</code>`;
      case 'bold':
        return `<strong>${renderInline(node.content, depth + 1)}</strong>`;
      case 'italic':
        return `<em>${renderInline(node.content, depth + 1)}</em>`;
      case 'underline':
        return `<u>${renderInline(node.content, depth + 1)}</u>`;
      case 'link': {
        const inner = renderInline(node.content, depth + 1);
        const href = safeHttpUrl(node.href);
        if (!href || !inner) return inner;
        return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
      }
      default:
        return ''; // unknown node type is dropped safely
    }
  }).join('');
}

// ---------------------------------------------------------------------------
// Blocks -> safe HTML. Headings keep a sane document outline: the page uses
// h2 for sections, so block level 2 -> h3, 3 -> h4, 4 -> h5.
// ---------------------------------------------------------------------------

const HEADING_TAGS = { 2: 'h3', 3: 'h4', 4: 'h5' };
const HEADING_CLASSES = { 2: 'mt-5 text-sm font-bold', 3: 'mt-4 text-xs font-bold', 4: 'mt-3 text-[11px] font-bold' };

export function renderBlocks(blocks) {
  if (!Array.isArray(blocks)) return '';
  return blocks.map(renderBlock).filter(Boolean).join('\n');
}

function renderBlock(block) {
  if (!block || typeof block !== 'object') return '';
  switch (block.type) {
    case 'heading': {
      const level = Number(block.level);
      const tag = HEADING_TAGS[level];
      const inner = renderInline(block.content);
      if (!tag || !inner) return '';
      return `<${tag} class="${HEADING_CLASSES[level]}">${inner}</${tag}>`;
    }
    case 'paragraph': {
      const inner = renderInline(block.content);
      if (!inner) return '';
      return `<p class="mt-3 text-xs leading-6 text-slate-600 dark:text-slate-300">${inner}</p>`;
    }
    case 'list': {
      if (!Array.isArray(block.items)) return '';
      const items = block.items
        .map((item) => renderInline(item))
        .filter(Boolean);
      if (!items.length) return '';
      if (block.ordered) {
        // Tailwind's preflight strips native list markers and list-decimal is
        // not in the built CSS, so numbers are rendered explicitly.
        const lis = items.map((inner, i) => `
          <li class="flex gap-2">
            <span class="shrink-0 font-bold text-purple-600">${i + 1}.</span>
            <span>${inner}</span>
          </li>`).join('');
        return `<ol class="mt-3 space-y-2 text-[11px] leading-5 text-slate-600 dark:text-slate-300">${lis}</ol>`;
      }
      const lis = items.map((inner) => `
        <li class="flex gap-2">
          <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-purple-600"></span>
          <span>${inner}</span>
        </li>`).join('');
      return `<ul class="mt-3 space-y-2.5 text-[11px] leading-5 text-slate-600 dark:text-slate-300">${lis}</ul>`;
    }
    case 'blockquote': {
      const inner = renderInline(block.content);
      if (!inner) return '';
      return `<blockquote class="mt-4 rounded-2xl bg-[#f0ebff] p-5 dark:bg-[#211d2d]">
        <p class="text-xs leading-6 text-slate-600 dark:text-slate-300">&ldquo;${inner}&rdquo;</p>
      </blockquote>`;
    }
    case 'code': {
      if (typeof block.code !== 'string' || !block.code) return '';
      return `<pre class="mt-3 overflow-x-auto rounded-2xl bg-[#f0ebff] p-4 text-[11px] leading-5 dark:bg-[#211d2d]"><code>${escapeHtml(block.code)}</code></pre>`;
    }
    default:
      return ''; // unknown block type is dropped safely
  }
}
