/* Admin SPA: login, dashboard, projects list, project editor (7 areas),
   media library, settings. Uses only component classes defined in admin.html. */
'use strict';

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  me: null,
  projects: [],       // cached admin list (all statuses)
  editor: null,       // project object currently being edited
  dirty: false,
  draftTimer: null,
};

const SECTION_TYPES = [
  'richText', 'imageGallery', 'statistics', 'checklist', 'keyModules',
  'beforeAfter', 'processSteps', 'linkCard', 'videoEmbed',
];

const BLOCK_TYPES = ['paragraph', 'heading', 'list', 'blockquote', 'code'];

const ROW_TEMPLATES = {
  media: () => ({ url: '', publicId: '', alt: '', caption: '', ratio: '16:10', sort: 0 }),
  link: () => ({ label: '', url: '', kind: 'other' }),
  gallery: () => ({ url: '', alt: '' }),
  stat: () => ({ value: '', label: '', note: '' }),
  module: () => ({ title: '', description: '' }),
  step: () => ({ title: '', description: '' }),
  glink: () => ({ label: '', url: '' }),
};

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// API base URL – same auto-detection as api.js, kept consistent sitewide.
// ---------------------------------------------------------------------------
const API_BASE = (() => {
  if (typeof window === 'undefined') {
    return '';
  }
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return '';
  }
  return 'https://bayoabdulai-api.onrender.com';
})();

// The bayo_csrf cookie is set by the backend on the api origin;
// it is not accessible to frontend JS on the different onrender.com origin.
// Instead, we store the CSRF token in localStorage after login so it
// persists across page reloads and new admin sessions.
const CSRF_STORAGE_KEY = 'bayo_csrf_token';

function readCsrf() {
  // Priority: localStorage (set after login) falls back to cookie read
  // (only possible on same-origin responses, kept for other flows).
  const stored = localStorage.getItem(CSRF_STORAGE_KEY);
  if (stored) return stored;
  const line = document.cookie.split('; ').find((c) => c.startsWith('bayo_csrf='));
  return line ? decodeURIComponent(line.slice('bayo_csrf='.length)) : '';
}

// Store the CSRF token in localStorage after a successful login.
// This is the safe mechanism: the backend sets httpOnly=false bayo_csrf
// cookie that JS cannot cross-origin read, so we mirror it into localStorage.
function storeCsrfToken(token) {
  localStorage.setItem(CSRF_STORAGE_KEY, token);
}

async function api(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(method !== 'GET' ? { 'x-csrf-token': readCsrf() } : {}),
    },
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (res.status === 401) {
    showLogin();
    const err = new Error('Session expired. Please sign in again.');
    err.code = 'UNAUTHORIZED';
    throw err;
  }
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Request failed (${res.status}).`);
    err.code = data?.error?.code;
    err.details = data?.error?.details;
    err.status = res.status;
    throw err;
  }
  return data;
}

// Multipart upload: FormData (browser sets the boundary), CSRF header only.
async function uploadImageFile(file) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch(`${API_BASE}/api/v1/admin/uploads`, {
    method: 'POST',
    headers: { 'x-csrf-token': readCsrf() },
    body: fd,
    credentials: 'include',
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (res.status === 401) {
    showLogin();
    const err = new Error('Session expired. Please sign in again.');
    err.code = 'UNAUTHORIZED';
    throw err;
  }
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Upload failed (${res.status}).`);
    err.code = data?.error?.code;
    err.details = data?.error?.details;
    throw err;
  }
  return data.data;
}

let pendingUploadTarget = 'media';

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function showLogin() {
  $('#login-view').classList.remove('hidden');
  $('#app-view').classList.add('hidden');
}

function showApp() {
  $('#login-view').classList.add('hidden');
  $('#app-view').classList.remove('hidden');
  $('#whoami').textContent = state.me?.email || '';
  route();
}

async function init() {
  try {
    const res = await fetch(`${API_BASE}/api/v1/admin/auth/me`, {
      credentials: 'include',
    });
    if (res.ok) {
      state.me = (await res.json()).data;
      showApp();
      return;
    }
  } catch { /* fall through to login */ }
  showLogin();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#login-btn');
  const errBox = $('#login-error');
  errBox.classList.add('hidden');
  btn.disabled = true;
  try {
    const res = await fetch(`${API_BASE}/api/v1/admin/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        email: $('#login-email').value.trim(),
        password: $('#login-password').value,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      errBox.textContent = data?.error?.message || `Login failed (${res.status}).`;
      errBox.classList.remove('hidden');
      return;
    }
    state.me = data.data;
    $('#login-password').value = '';
    // Store CSRF token in localStorage so it persists across page reloads
    // and new admin sessions (the bayo_csrf cookie lives on the backend
    // origin and is not readable by frontend JS on the frontend origin).
    storeCsrfToken(data.data.csrfToken);
    showApp();
  } catch {
    errBox.textContent = 'Network error. Please try again.';
    errBox.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
});

$('#logout-btn').addEventListener('click', async () => {
  try { await api('POST', '/api/v1/admin/auth/logout', {}); } catch { /* session may be gone */ }
  state.me = null;
  state.projects = [];
  showLogin();
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

function route() {
  const hash = location.hash || '#/';
  const section = hash === '#/' ? 'dashboard'
    : hash.startsWith('#/projects') ? 'projects'
    : hash === '#/media' ? 'media'
    : hash === '#/settings' ? 'settings'
    : 'dashboard';
  document.querySelectorAll('.nav-link').forEach((a) => {
    a.classList.toggle('active', a.dataset.nav === section);
  });

  if (hash === '#/projects/new') return openEditor(null);
  if (hash.startsWith('#/projects/')) return openEditor(hash.slice('#/projects/'.length));
  if (hash === '#/projects') return renderProjects();
  if (hash === '#/media') return renderMedia();
  if (hash === '#/settings') return renderSettings();
  return renderDashboard();
}

window.addEventListener('hashchange', route);

async function loadProjects() {
  const data = await api('GET', '/api/v1/admin/projects');
  state.projects = data.data;
  return state.projects;
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function badge(status) {
  return `<span class="badge badge-${esc(status)}">${esc(status)}</span>`;
}

function viewHead(title, actions = '') {
  return `<h1 class="h1">${esc(title)}</h1>${actions}`;
}

function errorBanner(err) {
  const detail = Array.isArray(err.details)
    ? ': ' + err.details.map((d) => `${esc(d.path)} ${esc(d.message)}`).join('; ')
    : '';
  return `<div class="banner banner-error"><span>${esc(err.message)}${detail}</span>
    <button class="btn btn-sm" data-act="banner-dismiss">Dismiss</button></div>`;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

async function renderDashboard() {
  const view = $('#view');
  view.innerHTML = '<p class="muted">Loading…</p>';
  try {
    await loadProjects();
    const ps = state.projects;
    const count = (fn) => ps.filter(fn).length;
    const recent = [...ps].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 5);
    view.innerHTML = `
      ${viewHead('Dashboard', `<div class="toolbar"><a class="btn btn-primary btn-sm" href="#/projects/new">+ New project</a></div>`)}
      <div class="grid-cards">
        <div class="stat"><b>${ps.length}</b><span class="muted">Projects</span></div>
        <div class="stat"><b>${count((p) => p.status === 'published')}</b><span class="muted">Published</span></div>
        <div class="stat"><b>${count((p) => p.status === 'draft')}</b><span class="muted">Drafts</span></div>
        <div class="stat"><b>${count((p) => p.status === 'archived')}</b><span class="muted">Archived</span></div>
        <div class="stat"><b>${count((p) => p.featured)}</b><span class="muted">Featured</span></div>
      </div>
      <h2 class="label" style="font-size:15px">Recently updated</h2>
      ${recent.length ? `<table class="table"><thead><tr><th>Title</th><th>Status</th><th>Updated</th></tr></thead><tbody>
        ${recent.map((p) => `<tr>
          <td><a href="#/projects/${p.id}">${esc(p.title)}</a></td>
          <td>${badge(p.status)}</td>
          <td class="muted">${new Date(p.updatedAt).toLocaleString()}</td>
        </tr>`).join('')}
      </tbody></table>` : '<p class="muted">No projects yet. Create the first one.</p>'}
    `;
  } catch (err) {
    view.innerHTML = errorBanner(err);
  }
}

// ---------------------------------------------------------------------------
// Projects list
// ---------------------------------------------------------------------------

async function renderProjects() {
  const view = $('#view');
  view.innerHTML = '<p class="muted">Loading…</p>';
  try {
    await loadProjects();
    const ps = state.projects;
    view.innerHTML = `
      ${viewHead('Projects', `
        <div class="toolbar">
          <input class="input" id="proj-search" placeholder="Filter by title, slug, category…" style="max-width:320px">
          <span class="spacer"></span>
          <a class="btn btn-primary btn-sm" href="#/projects/new">+ New project</a>
        </div>`)}
      <div id="proj-banner"></div>
      <table class="table" id="proj-table">
        <thead><tr>
          <th>Title</th><th>Category</th><th>Status</th><th>Order</th><th>Featured</th><th>Actions</th>
        </tr></thead>
        <tbody>
          ${ps.map((p) => `<tr data-id="${p.id}" data-search="${esc((p.title + ' ' + p.slug + ' ' + p.category).toLowerCase())}">
            <td><a href="#/projects/${p.id}"><strong>${esc(p.title)}</strong></a><br><span class="muted">${esc(p.slug)}</span></td>
            <td>${esc(p.category)}</td>
            <td>${badge(p.status)}</td>
            <td>${p.displayOrder}</td>
            <td>${p.featured ? '<span class="badge badge-featured">featured</span>' : '<span class="muted">—</span>'}</td>
            <td><div class="row">
              <a class="btn btn-sm" href="#/projects/${p.id}">Edit</a>
              ${p.status !== 'published' && p.status !== 'archived'
                ? `<button class="btn btn-sm btn-success" data-act="proj-publish" data-id="${p.id}">Publish</button>` : ''}
              ${p.status === 'published'
                ? `<button class="btn btn-sm" data-act="proj-unpublish" data-id="${p.id}">Unpublish</button>` : ''}
              ${p.status === 'archived'
                ? `<button class="btn btn-sm" data-act="proj-restore" data-id="${p.id}">Restore</button>`
                : `<button class="btn btn-sm" data-act="proj-archive" data-id="${p.id}">Archive</button>`}
              <button class="btn btn-sm" data-act="proj-feature" data-id="${p.id}" data-next="${p.featured ? 'false' : 'true'}">
                ${p.featured ? 'Unfeature' : 'Feature'}
              </button>
              <button class="btn btn-sm btn-danger" data-act="proj-delete" data-id="${p.id}">Delete</button>
            </div></td>
          </tr>`).join('')}
        </tbody>
      </table>
      ${ps.length === 0 ? '<p class="muted">No projects yet.</p>' : ''}
    `;
    $('#proj-search')?.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      document.querySelectorAll('#proj-table tbody tr').forEach((tr) => {
        tr.style.display = !q || tr.dataset.search.includes(q) ? '' : 'none';
      });
    });
  } catch (err) {
    view.innerHTML = errorBanner(err);
  }
}

// ---------------------------------------------------------------------------
// Media library (read-only aggregation until Cloudinary phase)
// ---------------------------------------------------------------------------

async function renderMedia() {
  const view = $('#view');
  view.innerHTML = '<p class="muted">Loading…</p>';
  try {
    await loadProjects();
    const items = [];
    state.projects.forEach((p) => (p.media || []).forEach((m) => {
      items.push({ ...m, project: p.title, projectId: p.id });
    }));
    view.innerHTML = `
      ${viewHead('Media Library')}
      <div class="banner banner-info"><span>Upload images from a project editor (Project Media or an image gallery section) — the file goes through the server to Cloudinary. This view aggregates every image referenced by a project.</span></div>
      ${items.length ? `<table class="table"><thead><tr><th>Image</th><th>Alt text</th><th>Project</th></tr></thead><tbody>
        ${items.map((m) => `<tr>
          <td class="muted" style="word-break:break-all">${esc(m.url)}</td>
          <td>${esc(m.alt) || '<span class="muted">—</span>'}</td>
          <td><a href="#/projects/${m.projectId}">${esc(m.project)}</a></td>
        </tr>`).join('')}
      </tbody></table>` : '<p class="muted">No media referenced by any project yet.</p>'}
    `;
  } catch (err) {
    view.innerHTML = errorBanner(err);
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function renderSettings() {
  $('#view').innerHTML = `
    ${viewHead('Settings')}
    <div class="fieldset">
      <p><strong>Account:</strong> ${esc(state.me?.email || '—')} (${esc(state.me?.role || 'admin')})</p>
      <p class="muted">Password changes are managed server-side; credentials live in .env and are seeded with <code>npm run seed:admin</code>.</p>
    </div>
    <div class="fieldset">
      <p class="legend">Service</p>
      <p class="muted">Single-admin portfolio dashboard. Public site: <a href="/" target="_blank" rel="noopener">/</a></p>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Rich text: markdown-ish authoring <-> structured inline nodes
// ---------------------------------------------------------------------------

function parseInline(text) {
  const nodes = [];
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(<u>([\s\S]*?)<\/u>)|(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push({ type: 'text', text: text.slice(last, m.index) });
    if (m[1]) nodes.push({ type: 'bold', content: [{ type: 'text', text: m[2] }] });
    else if (m[3]) nodes.push({ type: 'italic', content: [{ type: 'text', text: m[4] }] });
    else if (m[5]) nodes.push({ type: 'code', text: m[6] });
    else if (m[7]) nodes.push({ type: 'underline', content: [{ type: 'text', text: m[8] }] });
    else if (m[9]) nodes.push({ type: 'link', href: m[10], content: [{ type: 'text', text: m[11] }] });
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push({ type: 'text', text: text.slice(last) });
  if (nodes.length === 0) nodes.push({ type: 'text', text: '' });
  return nodes;
}

function serializeInline(nodes) {
  return (nodes || []).map((n) => {
    switch (n.type) {
      case 'text': return n.text;
      case 'bold': return '**' + serializeInline(n.content) + '**';
      case 'italic': return '*' + serializeInline(n.content) + '*';
      case 'code': return '`' + n.text + '`';
      case 'underline': return '<u>' + serializeInline(n.content) + '</u>';
      case 'link': return '[' + serializeInline(n.content) + '](' + n.href + ')';
      default: return '';
    }
  }).join('');
}

function blockText(b) {
  if (b.type === 'list') return (b.items || []).map(serializeInline).join('\n');
  if (b.type === 'code') return b.code || '';
  return serializeInline(b.content || []);
}

function retargetBlock(b, newType) {
  const text = blockText(b);
  delete b.content;
  delete b.items;
  delete b.code;
  delete b.language;
  delete b.level;
  b.type = newType;
  if (newType === 'list') b.items = text.split('\n').map(parseInline);
  else if (newType === 'code') b.code = text;
  else {
    b.content = parseInline(text);
    if (newType === 'heading') b.level = 2;
  }
}

// ---------------------------------------------------------------------------
// Editor: path-based state access
// ---------------------------------------------------------------------------

function getByPath(path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), state.editor);
}

function setByPath(path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const parent = keys.reduce((o, k) => o[k], state.editor);
  parent[last] = value;
}

function markDirty() {
  state.dirty = true;
  clearTimeout(state.draftTimer);
  state.draftTimer = setTimeout(writeDraft, 800);
}

// ---------------------------------------------------------------------------
// Local draft recovery (scoped per admin + project, 7-day retention)
// ---------------------------------------------------------------------------

const DRAFT_TTL = 7 * 24 * 60 * 60 * 1000;

function draftKey(id) {
  return `bayo-admin-draft:${state.me?.email || 'unknown'}:${id || 'new'}`;
}

function readDraft(id) {
  let raw;
  try { raw = localStorage.getItem(draftKey(id)); } catch { return null; }
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    if (!d?.ts || Date.now() - d.ts > DRAFT_TTL) {
      localStorage.removeItem(draftKey(id));
      return null;
    }
    return d;
  } catch {
    return null;
  }
}

function writeDraft() {
  if (!state.editor || !state.dirty) return;
  try {
    localStorage.setItem(draftKey(state.editor.id), JSON.stringify({
      ts: Date.now(),
      version: state.editor.version,
      data: state.editor,
    }));
  } catch { /* storage full/unavailable */ }
}

function clearDraft(id) {
  try {
    localStorage.removeItem(draftKey(id));
    localStorage.removeItem(draftKey(null));
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Editor rendering
// ---------------------------------------------------------------------------

function field(label, control, hint = '') {
  return `<div class="field"><span class="label">${label}</span>${control}
    ${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
}

function fieldset(legend, body) {
  return `<fieldset class="fieldset"><legend class="legend">${legend}</legend>${body}</fieldset>`;
}

function blockEditorHtml(blocks, basePath, addLabel) {
  const cards = blocks.map((b, i) => {
    const p = `${basePath}.${i}`;
    let body = '';
    if (b.type === 'heading') {
      body = `
        <div class="grid-2">
          ${field('Level', `<select class="select" data-path="${p}.level" data-kind="int">
            ${[2, 3, 4].map((l) => `<option value="${l}" ${b.level === l ? 'selected' : ''}>H${l}</option>`).join('')}
          </select>`)}
        </div>
        ${field('Text', `<textarea class="textarea" data-path="${p}" data-kind="inline">${esc(blockText(b))}</textarea>`)}`;
    } else if (b.type === 'list') {
      body = field('Items (one per line; inline styles allowed)', `<textarea class="textarea" data-path="${p}" data-kind="list">${esc(blockText(b))}</textarea>`);
    } else if (b.type === 'code') {
      body = `${field('Language', `<input class="input" data-path="${p}.language" value="${esc(b.language || '')}">`)}
        ${field('Code', `<textarea class="textarea" data-path="${p}.code" data-kind="raw">${esc(b.code || '')}</textarea>`)}`;
    } else {
      body = field(`${b.type === 'blockquote' ? 'Quote' : 'Text'} (inline styles: **bold** *italic* \`code\` [link](url) <u>underline</u>)`,
        `<textarea class="textarea" data-path="${p}" data-kind="inline">${esc(blockText(b))}</textarea>`);
    }
    return `<div class="section-card">
      <div class="section-head">
        <select class="select" data-block-type data-base="${basePath}" data-idx="${i}" style="max-width:170px">
          ${BLOCK_TYPES.map((t) => `<option value="${t}" ${b.type === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <div class="row">
          <button class="btn btn-sm" data-act="block-up" data-base="${basePath}" data-idx="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn btn-sm" data-act="block-down" data-base="${basePath}" data-idx="${i}" ${i === blocks.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn btn-sm btn-danger" data-act="block-del" data-base="${basePath}" data-idx="${i}">✕</button>
        </div>
      </div>
      ${body}
    </div>`;
  }).join('');
  return `${cards || '<p class="muted">No blocks yet.</p>'}
    <div class="toolbar">
      <select class="select" data-new-block-type style="max-width:170px">
        ${BLOCK_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('')}
      </select>
      <button class="btn btn-sm" data-act="block-add" data-base="${basePath}">${esc(addLabel)}</button>
    </div>`;
}

function rowsHtml(path, rows, tpl, cells) {
  return rows.map((r, i) => `
    <div class="row-card">
      <div class="row">
        ${cells(r, `${path}.${i}`)}
        <button class="btn btn-sm btn-danger" data-act="row-del" data-path="${path}" data-idx="${i}">✕</button>
      </div>
    </div>`).join('');
}

function mediaCells(m, p) {
  return `<div class="grid-4" style="flex:1">
    <div><span class="label">Image URL/path *</span><input class="input" data-path="${p}.url" value="${esc(m.url)}"></div>
    <div><span class="label">Alt text</span><input class="input" data-path="${p}.alt" value="${esc(m.alt || '')}"></div>
    <div><span class="label">Ratio</span><select class="select" data-path="${p}.ratio" data-kind="text">
      ${['16:10', '4:3', '3:4', '1:1', '9:16', 'auto'].map((r) => `<option ${m.ratio === r ? 'selected' : ''}>${r}</option>`).join('')}
    </select></div>
  </div>`;
}

function sectionBodyHtml(s, i) {
  const p = `sections.${i}`;
  switch (s.type) {
    case 'richText':
      return blockEditorHtml(s.blocks || [], `${p}.blocks`, 'Add block');
    case 'imageGallery':
      return `${rowsHtml(`${p}.images`, s.images || [], 'gallery', (r, rp) => `
          <div class="grid-3" style="flex:1">
            <div><span class="label">Image URL/path *</span><input class="input" data-path="${rp}.url" value="${esc(r.url)}"></div>
            <div><span class="label">Alt text</span><input class="input" data-path="${rp}.alt" value="${esc(r.alt || '')}"></div>
            <div><span class="label">Caption</span><input class="input" data-path="${rp}.caption" value="${esc(r.caption || '')}"></div>
          </div>`)}
        <div class="row">
          <button class="btn btn-sm" data-act="upload-pick" data-target="${p}.images">⬆ Upload</button>
          <button class="btn btn-sm" data-act="row-add" data-path="${p}.images" data-tpl="gallery">+ Add by URL</button>
        </div>`;
    case 'statistics':
      return `${rowsHtml(`${p}.items`, s.items || [], 'stat', (r, rp) => `
          <div class="grid-3" style="flex:1">
            <div><span class="label">Value *</span><input class="input" data-path="${rp}.value" value="${esc(r.value)}"></div>
            <div><span class="label">Label *</span><input class="input" data-path="${rp}.label" value="${esc(r.label)}"></div>
            <div><span class="label">Note</span><input class="input" data-path="${rp}.note" value="${esc(r.note || '')}"></div>
          </div>`)}
        <button class="btn btn-sm" data-act="row-add" data-path="${p}.items" data-tpl="stat">+ Add statistic</button>`;
    case 'checklist':
      return field('Items (one per line)', `<textarea class="textarea" data-path="${p}.items" data-kind="lines">${esc((s.items || []).join('\n'))}</textarea>`);
    case 'keyModules':
      return `${rowsHtml(`${p}.items`, s.items || [], 'module', (r, rp) => `
          <div class="grid-2" style="flex:1">
            <div><span class="label">Module title *</span><input class="input" data-path="${rp}.title" value="${esc(r.title)}"></div>
            <div><span class="label">Description</span><input class="input" data-path="${rp}.description" value="${esc(r.description || '')}"></div>
          </div>`)}
        <button class="btn btn-sm" data-act="row-add" data-path="${p}.items" data-tpl="module">+ Add module</button>`;
    case 'beforeAfter':
      return `
        <div class="grid-2">
          ${field('Before image URL/path *', `<input class="input" data-path="${p}.before.url" value="${esc(s.before?.url || '')}">`)}
          ${field('Before alt text', `<input class="input" data-path="${p}.before.alt" value="${esc(s.before?.alt || '')}">`)}
          ${field('After image URL/path *', `<input class="input" data-path="${p}.after.url" value="${esc(s.after?.url || '')}">`)}
          ${field('After alt text', `<input class="input" data-path="${p}.after.alt" value="${esc(s.after?.alt || '')}">`)}
        </div>
        ${field('Note', `<input class="input" data-path="${p}.note" value="${esc(s.note || '')}">`)}`;
    case 'processSteps':
      return `${rowsHtml(`${p}.steps`, s.steps || [], 'step', (r, rp) => `
          <div class="grid-3" style="flex:1">
            <div><span class="label">Step title *</span><input class="input" data-path="${rp}.title" value="${esc(r.title)}"></div>
            <div><span class="label">Description</span><input class="input" data-path="${rp}.description" value="${esc(r.description || '')}"></div>
            <div><span class="label">Image URL (optional)</span><input class="input" data-path="${rp}.image.url" value="${esc(r.image?.url || '')}"></div>
          </div>`)}
        <button class="btn btn-sm" data-act="row-add" data-path="${p}.steps" data-tpl="step">+ Add step</button>`;
    case 'linkCard':
      return `${field('Heading *', `<input class="input" data-path="${p}.heading" value="${esc(s.heading || '')}">`)}
        ${field('Supporting text', `<input class="input" data-path="${p}.text" value="${esc(s.text || '')}">`)}
        ${rowsHtml(`${p}.links`, s.links || [], 'glink', (r, rp) => `
          <div class="grid-3" style="flex:1">
            <div><span class="label">Label *</span><input class="input" data-path="${rp}.label" value="${esc(r.label)}"></div>
            <div><span class="label">URL *</span><input class="input" data-path="${rp}.url" value="${esc(r.url)}"></div>
          </div>`)}
        <button class="btn btn-sm" data-act="row-add" data-path="${p}.links" data-tpl="glink">+ Add link</button>`;
    case 'videoEmbed':
      return `<div class="grid-2">
          ${field('Provider', `<select class="select" data-path="${p}.provider" data-kind="text">
            <option value="youtube" ${s.provider === 'youtube' ? 'selected' : ''}>YouTube</option>
            <option value="vimeo" ${s.provider === 'vimeo' ? 'selected' : ''}>Vimeo</option>
          </select>`)}
          ${field('Video ID *', `<input class="input" data-path="${p}.videoId" value="${esc(s.videoId || '')}" placeholder="dQw4w9WgXcQ">`)}
        </div>
        ${field('Caption', `<input class="input" data-path="${p}.caption" value="${esc(s.caption || '')}">`)}`;
    default:
      return '<p class="muted">Unknown section type.</p>';
  }
}

function sectionsEditorHtml(sections) {
  const cards = sections.map((s, i) => `
    <div class="section-card">
      <div class="section-head">
        <div class="row">
          <span class="section-type">${esc(s.type)}</span>
          <input class="input" data-path="sections.${i}.title" value="${esc(s.title || '')}" placeholder="Section title (optional)" style="max-width:280px">
        </div>
        <div class="row">
          <button class="btn btn-sm" data-act="section-up" data-idx="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn btn-sm" data-act="section-down" data-idx="${i}" ${i === sections.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn btn-sm" data-act="section-dup" data-idx="${i}">⧉</button>
          <button class="btn btn-sm btn-danger" data-act="section-del" data-idx="${i}">✕</button>
        </div>
      </div>
      ${sectionBodyHtml(s, i)}
    </div>`).join('');
  return `${cards || '<p class="muted">No content sections yet.</p>'}
    <div class="toolbar">
      <select class="select" id="new-section-type" style="max-width:220px">
        ${SECTION_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('')}
      </select>
      <button class="btn btn-primary btn-sm" data-act="section-add">Add section</button>
    </div>`;
}

function blankProject() {
  return {
    id: null,
    title: '', slug: '', shortDescription: '', category: '',
    status: 'draft', featured: false, displayOrder: 0,
    tags: [], role: '', duration: '', tools: [], objectives: [],
    overview: [], sections: [], media: [], links: [],
    seo: { title: '', description: '', canonical: '', image: '', imageAlt: '' },
    version: 1, updatedAt: null,
  };
}

function reviewHtml(p) {
  const btns = [];
  if (p.status === 'draft') {
    btns.push(`<button class="btn btn-primary" data-act="ed-save">Save draft</button>`);
    btns.push(`<button class="btn btn-success" data-act="ed-publish">Publish</button>`);
  } else if (p.status === 'published') {
    btns.push(`<button class="btn btn-primary" data-act="ed-save">Save changes</button>`);
    btns.push(`<button class="btn" data-act="ed-unpublish">Unpublish</button>`);
  } else {
    btns.push(`<button class="btn btn-success" data-act="ed-restore">Restore to draft</button>`);
  }
  if (p.status !== 'archived') btns.push(`<button class="btn" data-act="ed-archive">Archive</button>`);
  if (p.slug) btns.push(`<a class="btn" href="/admin/preview/${encodeURIComponent(p.slug)}" target="_blank" rel="noopener">Preview</a>`);
  if (p.id) btns.push(`<button class="btn btn-danger" data-act="ed-delete">Delete permanently</button>`);

  return `
    <div class="row">
      ${badge(p.status)}
      ${p.featured ? '<span class="badge badge-featured">featured</span>' : ''}
      ${p.id ? `<span class="muted">version ${p.version}${p.updatedAt ? ' · updated ' + new Date(p.updatedAt).toLocaleString() : ''}</span>` : '<span class="muted">not saved yet</span>'}
    </div>
    <div class="toolbar">${btns.join('')}</div>
    <p class="hint">Publishing validates the full payload server-side before saving. Preview renders the real public template; the public URL (<code>/projects/&lt;slug&gt;</code>) serves only published projects.</p>`;
}

function editorHtml(p) {
  return `
    <div class="toolbar">
      <a class="btn btn-sm" href="#/projects">← Projects</a>
      <strong>${esc(p.title || 'New project')}</strong>
      ${badge(p.status)}
      ${p.featured ? '<span class="badge badge-featured">featured</span>' : ''}
    </div>
    <div id="editor-banners"></div>
    <div id="editor-root">${editorBodyHtml(p)}</div>`;
}

function editorBodyHtml(p) {
  const categoryList = [...new Set(state.projects.map((x) => x.category).filter(Boolean))]
    .map((c) => `<option value="${esc(c)}">`).join('');
  return `
      ${fieldset('1. Basic information', `
        <div class="grid-2">
          ${field('Title *', `<input class="input" data-path="title" value="${esc(p.title)}">`)}
          ${field('Slug', `<input class="input" data-path="slug" value="${esc(p.slug || '')}" placeholder="blank = derive from title">`)}
        </div>
        ${field('Category *', `<input class="input" data-path="category" list="category-list" value="${esc(p.category)}"><datalist id="category-list">${categoryList}</datalist>`)}
        ${field('Short description *', `<textarea class="textarea" data-path="shortDescription" maxlength="300">${esc(p.shortDescription)}</textarea>`, 'Maximum 300 characters. Used on cards and search results.')}
        <div class="grid-2">
          ${field('Display order', `<input class="input" type="number" min="0" data-path="displayOrder" data-kind="int" value="${p.displayOrder}">`)}
          ${field('Featured', `<label class="row"><input type="checkbox" data-path="featured" data-kind="bool" ${p.featured ? 'checked' : ''}> Show on homepage featured area</label>`)}
        </div>`)}
      ${fieldset('2. Project details', `
        <div class="grid-2">
          ${field('Role', `<input class="input" data-path="role" value="${esc(p.role || '')}">`)}
          ${field('Duration', `<input class="input" data-path="duration" value="${esc(p.duration || '')}">`)}
        </div>
        ${field('Tools (comma-separated)', `<input class="input" data-path="tools" data-kind="csv" value="${esc((p.tools || []).join(', '))}">`)}
        ${field('Tags (comma-separated)', `<input class="input" data-path="tags" data-kind="csv" value="${esc((p.tags || []).join(', '))}">`)}
        ${field('Objectives (one per line)', `<textarea class="textarea" data-path="objectives" data-kind="lines">${esc((p.objectives || []).join('\n'))}</textarea>`)}
        ${field('Overview', blockEditorHtml(p.overview || [], 'overview', 'Add overview block'))}`)}
      ${fieldset('3. Project media', `
        ${rowsHtml('media', p.media || [], 'media', mediaCells)}
        <div class="toolbar">
          <input type="file" id="media-file" class="hidden" accept="image/png,image/jpeg,image/webp">
          <button class="btn btn-sm" data-act="upload-pick" data-target="media">⬆ Upload image (PNG/JPEG/WebP, max 5 MB)</button>
          <button class="btn btn-sm" data-act="row-add" data-path="media" data-tpl="media">+ Add by URL</button>
        </div>
        <p class="hint">Uploads are validated (type + size + magic bytes) and stored server-side in Cloudinary; the response fills url + publicId for you. Local /assets paths can still be pasted manually.</p>`)}
      ${fieldset('4. Content sections', sectionsEditorHtml(p.sections || []))}
      ${fieldset('5. Project links', `
        ${rowsHtml('links', p.links || [], 'link', (r, rp) => `
          <div class="grid-3" style="flex:1">
            <div><span class="label">Label *</span><input class="input" data-path="${rp}.label" value="${esc(r.label)}"></div>
            <div><span class="label">URL *</span><input class="input" data-path="${rp}.url" value="${esc(r.url)}"></div>
            <div><span class="label">Kind</span><select class="select" data-path="${rp}.kind" data-kind="text">
              ${['prototype', 'live', 'github', 'other'].map((k) => `<option value="${k}" ${r.kind === k ? 'selected' : ''}>${k}</option>`).join('')}
            </select></div>
          </div>`)}
        <button class="btn btn-sm" data-act="row-add" data-path="links" data-tpl="link">+ Add link</button>`)}
      ${fieldset('6. SEO', `
        ${field('SEO title', `<input class="input" maxlength="70" data-path="seo.title" value="${esc(p.seo?.title || '')}">`)}
        ${field('SEO description', `<textarea class="textarea" maxlength="170" data-path="seo.description">${esc(p.seo?.description || '')}</textarea>`)}
        ${field('Canonical URL', `<input class="input" data-path="seo.canonical" value="${esc(p.seo?.canonical || '')}">`)}
        <div class="grid-2">
          ${field('OG image URL/path', `<input class="input" data-path="seo.image" value="${esc(p.seo?.image || '')}">`)}
          ${field('OG image alt', `<input class="input" data-path="seo.imageAlt" value="${esc(p.seo?.imageAlt || '')}">`)}
        </div>`)}
      ${fieldset('7. Review and publishing', reviewHtml(p))}`;
}

// ---------------------------------------------------------------------------
// Editor lifecycle
// ---------------------------------------------------------------------------

async function openEditor(id) {
  const view = $('#view');
  view.innerHTML = '<p class="muted">Loading…</p>';
  try {
    if (!state.projects.length) await loadProjects();
    if (id) {
      const data = await api('GET', `/api/v1/admin/projects/${id}`);
      state.editor = data.data;
    } else {
      state.editor = blankProject();
    }
    state.dirty = false;
    renderEditor();

    const draft = readDraft(state.editor.id);
    if (draft && draft.data) {
      const changedOnServer = state.editor.updatedAt && draft.ts < Date.parse(state.editor.updatedAt);
      const banner = document.createElement('div');
      banner.className = 'banner banner-warn';
      banner.id = 'recovery-banner';
      banner.innerHTML = `<span>Unsaved local changes from ${new Date(draft.ts).toLocaleString()}${changedOnServer ? ' (the server copy has changed since)' : ''}.</span>
        <span class="row">
          <button class="btn btn-sm" data-act="draft-restore">Restore draft</button>
          <button class="btn btn-sm btn-danger" data-act="draft-discard">Discard</button>
        </span>`;
      $('#editor-banners').appendChild(banner);
    }
  } catch (err) {
    view.innerHTML = errorBanner(err);
  }
}

function renderEditor() {
  $('#view').innerHTML = `
    <h1 class="h1">${state.editor.id ? 'Edit project' : 'New project'}</h1>
    ${editorHtml(state.editor)}`;
  wireEditor();
}

function wireEditor() {
  const root = $('#editor-root');
  if (!root || root.dataset.wired) return;
  root.dataset.wired = '1';
  root.addEventListener('input', onEditorInput);
  root.addEventListener('change', onEditorInput);
}

function onEditorInput(e) {
  const el = e.target;
  const path = el.dataset.path;
  if (!path || el.hasAttribute('data-block-type')) return;
  const kind = el.dataset.kind || 'text';
  switch (kind) {
    case 'bool': setByPath(path, el.checked); break;
    case 'int': setByPath(path, Number.parseInt(el.value, 10) || 0); break;
    case 'csv': setByPath(path, el.value.split(',').map((s) => s.trim()).filter(Boolean)); break;
    case 'lines': setByPath(path, el.value.split('\n').map((s) => s.trim()).filter(Boolean)); break;
    case 'raw': setByPath(path, el.value); break;
    case 'inline': getByPath(path).content = parseInline(el.value); break;
    case 'list': getByPath(path).items = el.value.split('\n').filter((l) => l.trim() !== '').map(parseInline); break;
    default: setByPath(path, el.value);
  }
  markDirty();
}

// ---------------------------------------------------------------------------
// Editor + list actions (single delegated click handler)
// ---------------------------------------------------------------------------

document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;
  try {
    switch (act) {
      // --- generic ---
      case 'banner-dismiss': t.closest('.banner').remove(); break;

      // --- projects list ---
      case 'proj-publish':
      case 'proj-unpublish':
      case 'proj-archive': {
        const status = act === 'proj-publish' ? 'published' : act === 'proj-unpublish' ? 'draft' : 'archived';
        await api('PATCH', `/api/v1/admin/projects/${t.dataset.id}/status`, { status });
        toast(`Status → ${status}`);
        await renderProjects();
        break;
      }
      case 'proj-restore':
        await api('POST', `/api/v1/admin/projects/${t.dataset.id}/restore`, {});
        toast('Restored to draft');
        await renderProjects();
        break;
      case 'proj-feature':
        await api('PATCH', `/api/v1/admin/projects/${t.dataset.id}/featured`, { featured: t.dataset.next === 'true' });
        toast('Featured updated');
        await renderProjects();
        break;
      case 'proj-delete':
        if (window.confirm('Permanently delete this project? This cannot be undone.')) {
          await api('DELETE', `/api/v1/admin/projects/${t.dataset.id}?confirm=true`);
          toast('Project deleted');
          await renderProjects();
        }
        break;

      // --- editor: structure ---
      case 'section-add': {
        const type = $('#new-section-type').value;
        const sec = { type };
        if (type === 'richText') sec.blocks = [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }];
        else if (type === 'imageGallery') sec.images = [ROW_TEMPLATES.gallery()];
        else if (type === 'statistics') sec.items = [ROW_TEMPLATES.stat()];
        else if (type === 'checklist') sec.items = [''];
        else if (type === 'keyModules') sec.items = [ROW_TEMPLATES.module()];
        else if (type === 'beforeAfter') { sec.before = { url: '', alt: '' }; sec.after = { url: '', alt: '' }; }
        else if (type === 'processSteps') sec.steps = [ROW_TEMPLATES.step()];
        else if (type === 'linkCard') { sec.heading = ''; sec.links = [ROW_TEMPLATES.glink()]; }
        else if (type === 'videoEmbed') { sec.provider = 'youtube'; sec.videoId = ''; }
        state.editor.sections.push(sec);
        structuralChange();
        break;
      }
      case 'section-up': case 'section-down': case 'section-dup': case 'section-del': {
        const i = Number(t.dataset.idx);
        const arr = state.editor.sections;
        if (act === 'section-del') arr.splice(i, 1);
        else if (act === 'section-dup') arr.splice(i + 1, 0, JSON.parse(JSON.stringify(arr[i])));
        else {
          const j = act === 'section-up' ? i - 1 : i + 1;
          if (j >= 0 && j < arr.length) [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        structuralChange();
        break;
      }

      // --- editor: blocks ---
      case 'block-add': {
        const base = t.dataset.base;
        const type = t.parentElement.querySelector('[data-new-block-type]').value;
        const b = { type };
        if (type === 'heading') { b.level = 2; b.content = [{ type: 'text', text: '' }]; }
        else if (type === 'list') b.items = [[{ type: 'text', text: '' }]];
        else if (type === 'code') b.code = '';
        else b.content = [{ type: 'text', text: '' }];
        getByPath(base).push(b);
        structuralChange();
        break;
      }
      case 'block-up': case 'block-down': case 'block-del': {
        const base = t.dataset.base;
        const i = Number(t.dataset.idx);
        const arr = getByPath(base);
        if (act === 'block-del') arr.splice(i, 1);
        else {
          const j = act === 'block-up' ? i - 1 : i + 1;
          if (j >= 0 && j < arr.length) [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        structuralChange();
        break;
      }

      // --- editor: upload + rows ---
      case 'upload-pick':
        pendingUploadTarget = t.dataset.target || 'media';
        $('#media-file').click();
        break;
      case 'row-add': {
        getByPath(t.dataset.path).push(ROW_TEMPLATES[t.dataset.tpl]());
        structuralChange();
        break;
      }
      case 'row-del': {
        const arr = getByPath(t.dataset.path);
        const idx = Number(t.dataset.idx);
        const row = arr[idx];
        let destroyAfter = false;
        if (row && row.publicId) {
          destroyAfter = window.confirm(
            'Also permanently delete this image file from Cloudinary?\n\n'
            + 'OK = detach from this project AND delete the stored file.\n'
            + 'Cancel = detach only (the file stays in Cloudinary).',
          );
        }
        arr.splice(idx, 1);
        structuralChange();
        if (row && row.publicId && destroyAfter) {
          // Audit order: update the record first, destroy the asset last.
          const saved = state.editor.id ? await saveEditor({ publish: false }) : true;
          if (saved) {
            try {
              await api('DELETE', `/api/v1/admin/uploads?publicId=${encodeURIComponent(row.publicId)}`);
              toast('Image removed from Cloudinary');
            } catch (err) {
              showEditorError(err);
            }
          }
        }
        break;
      }

      // --- editor: drafts ---
      case 'draft-restore': {
        const draft = readDraft(state.editor.id);
        if (draft?.data) {
          state.editor = draft.data;
          state.dirty = true;
          renderEditor();
          toast('Draft restored — review, then save');
        }
        $('#recovery-banner')?.remove();
        break;
      }
      case 'draft-discard':
        clearDraft(state.editor.id);
        $('#recovery-banner')?.remove();
        toast('Local draft discarded');
        break;

      // --- editor: saving ---
      case 'ed-save': await saveEditor({ publish: false }); break;
      case 'ed-publish': await saveEditor({ publish: true }); break;
      case 'ed-unpublish': await patchStatus('draft'); break;
      case 'ed-archive': await patchStatus('archived'); break;
      case 'ed-restore': await restoreProject(); break;
      case 'ed-delete': {
        if (window.confirm('Permanently delete this project? This cannot be undone.')) {
          await api('DELETE', `/api/v1/admin/projects/${state.editor.id}?confirm=true`);
          clearDraft(state.editor.id);
          state.dirty = false;
          toast('Project deleted');
          location.hash = '#/projects';
        }
        break;
      }

      // --- conflict resolution ---
      case 'conflict-load':
        clearDraft(state.editor.id);
        state.dirty = false;
        await openEditor(state.editor.id);
        toast('Loaded latest server version');
        break;
      case 'conflict-overwrite': {
        const latest = (await api('GET', `/api/v1/admin/projects/${state.editor.id}`)).data;
        const payload = collectEditor(false);
        payload.version = latest.version;
        const saved = (await api('PUT', `/api/v1/admin/projects/${state.editor.id}`, payload)).data;
        applySaved(saved, 'Overwritten with your version');
        break;
      }
      default: break;
    }
  } catch (err) {
    showEditorError(err);
  }
});

document.addEventListener('change', async (e) => {
  // Hidden file input shared by the media fieldset and gallery sections.
  if (e.target.id !== 'media-file') return;
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file || !state.editor) return;
  try {
    const up = await uploadImageFile(file);
    const arr = getByPath(pendingUploadTarget);
    if (Array.isArray(arr)) {
      arr.push({ url: up.url, publicId: up.publicId, alt: '', caption: '', ratio: '16:10', sort: arr.length });
      structuralChange();
      toast('Image uploaded');
    } else {
      showEditorError(new Error('Upload target is no longer available.'));
    }
  } catch (err) {
    showEditorError(err);
  }
});

document.addEventListener('change', (e) => {
  const sel = e.target.closest('[data-block-type]');
  if (!sel) return;
  const arr = getByPath(sel.dataset.base);
  retargetBlock(arr[Number(sel.dataset.idx)], sel.value);
  structuralChange();
});

function structuralChange() {
  markDirty();
  writeDraft();
  const root = $('#editor-root');
  if (!root) return;
  root.innerHTML = editorBodyHtml(state.editor);
  wireEditor();
}

function showEditorError(err) {
  const box = $('#editor-banners');
  if (box) {
    box.innerHTML = errorBanner(err);
  } else {
    toast(err.message);
  }
}

function editorBanners() {
  const box = $('#editor-banners');
  if (box) box.innerHTML = '';
}

// ---------------------------------------------------------------------------
// Editor: save / publish / status
// ---------------------------------------------------------------------------

function collectEditor(publish) {
  const p = state.editor;
  const out = {
    title: (p.title || '').trim(),
    shortDescription: (p.shortDescription || '').trim(),
    category: (p.category || '').trim(),
    featured: !!p.featured,
    displayOrder: Number(p.displayOrder) || 0,
    role: p.role || '',
    duration: p.duration || '',
    tools: p.tools || [],
    tags: p.tags || [],
    objectives: p.objectives || [],
    overview: p.overview || [],
    sections: p.sections || [],
    media: p.media || [],
    links: p.links || [],
    seo: p.seo || {},
  };
  if ((p.slug || '').trim()) out.slug = p.slug.trim();
  if (publish) out.status = 'published';
  return out;
}

function validateEditor() {
  const missing = [];
  if (!(state.editor.title || '').trim()) missing.push('title');
  if (!(state.editor.shortDescription || '').trim()) missing.push('short description');
  if (!(state.editor.category || '').trim()) missing.push('category');
  if (missing.length) throw Object.assign(new Error(`Required fields missing: ${missing.join(', ')}.`), { code: 'CLIENT_VALIDATION' });
}

async function saveEditor({ publish }) {
  editorBanners();
  try {
    validateEditor();
    const payload = collectEditor(publish);
    let saved;
    if (!state.editor.id) {
      saved = (await api('POST', '/api/v1/admin/projects', payload)).data;
    } else {
      payload.version = state.editor.version;
      saved = (await api('PUT', `/api/v1/admin/projects/${state.editor.id}`, payload)).data;
    }
    applySaved(saved, publish ? 'Published' : 'Saved');
    if (location.hash !== `#/projects/${saved.id}`) history.replaceState(null, '', `#/projects/${saved.id}`);
    return true;
  } catch (err) {
    if (err.code === 'VERSION_CONFLICT') showConflict(err.details.currentVersion);
    else showEditorError(err);
    return false;
  }
}

function showConflict(serverVersion) {
  const box = $('#editor-banners');
  if (box) {
    box.innerHTML = `<div class="banner banner-warn">
      <span>The server has a newer version (${serverVersion}) than your editor (version ${state.editor.version}). Your changes were <strong>not</strong> applied.</span>
      <span class="row">
        <button class="btn btn-sm" data-act="conflict-load">Load latest (discard mine)</button>
        <button class="btn btn-sm btn-danger" data-act="conflict-overwrite">Overwrite with mine</button>
      </span></div>`;
  }
}

function applySaved(saved, msg) {
  state.editor = { ...state.editor, ...saved };
  state.dirty = false;
  clearDraft(saved.id);
  clearTimeout(state.draftTimer);
  renderEditor();
  toast(msg);
}

async function patchStatus(status) {
  editorBanners();
  const saved = (await api('PATCH', `/api/v1/admin/projects/${state.editor.id}/status`, { status })).data;
  applySaved(saved, `Status → ${status}`);
}

async function restoreProject() {
  editorBanners();
  const saved = (await api('POST', `/api/v1/admin/projects/${state.editor.id}/restore`, {})).data;
  applySaved(saved, 'Restored to draft');
}

window.addEventListener('beforeunload', (e) => {
  if (state.dirty) {
    writeDraft();
    e.preventDefault();
    e.returnValue = '';
  }
});

init();
