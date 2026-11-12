// Clean URLs for the existing static pages.
// Original .html URLs keep working unchanged via express.static.
// Phase 5 adds the dynamic project detail route and the admin preview route,
// both server-rendered from MongoDB by the shared template renderer.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import Project from '../models/Project.js';
import { requireAdminPage } from '../middleware/auth.js';
import { renderProjectPage } from '../render/project-page.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PUBLIC_DIR = path.resolve(__dirname, '../../public');

const PAGE_ROUTES = {
  '/work': 'work.html',
  '/about': 'about.html',
  '/contact': 'contact.html',
  '/resume': 'resume.html',
  '/admin': 'admin.html',
};

const router = Router();

for (const [route, file] of Object.entries(PAGE_ROUTES)) {
  router.get(route, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, file));
  });
}

// ---------------------------------------------------------------------------
// GET /projects/:slug — public detail page for published projects only.
// Unknown, Draft and Archived slugs are indistinguishable: one findOne with
// status:'published' answers all three, and a miss falls through to the
// site-wide 404 handler (same response as any unknown page). Database
// failures propagate to the error handler as a safe HTML 500 — never a 404.
// ---------------------------------------------------------------------------

router.get('/projects/:slug', async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').slice(0, 200);
    const project = await Project.findOne({ slug, status: 'published' }).lean();
    if (!project) return next();
    res.type('html').send(renderProjectPage(project, { preview: false }));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/preview/:slug — authenticated preview of any project (Draft and
// Archived included) through the SAME renderer as the public page. Read-only:
// it never publishes or modifies the project, is never cached, and is
// noindexed. Unauthenticated browsers are redirected to the admin shell.
// ---------------------------------------------------------------------------

router.get('/admin/preview/:slug', requireAdminPage, async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').slice(0, 200);
    const project = await Project.findOne({ slug }).lean();
    if (!project) return next();
    res.set('Cache-Control', 'no-store');
    res.type('html').send(renderProjectPage(project, { preview: true }));
  } catch (err) {
    next(err);
  }
});

export default router;
