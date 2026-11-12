import { Router } from 'express';
import mongoose from 'mongoose';
import Project from '../../models/Project.js';
import { requireAdmin } from '../../middleware/auth.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { wrap } from '../../utils/asyncHandler.js';
import {
  projectCreateSchema,
  projectUpdateSchema,
  statusPatchSchema,
  featuredPatchSchema,
  orderPatchSchema,
} from '../../validation/schemas.js';

const router = Router();

// All /api/v1/admin/projects* endpoints require authentication (section 8).
router.use(requireAdmin);
// Mutating methods additionally require the double-submit CSRF token;
// GET requests pass through (section 7).
router.use((req, res, next) => (req.method === 'GET' ? next() : requireCsrf(req, res, next)));

const slugify = (s) => s
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 160);

function validationError(res, error) {
  res.status(400).json({
    ok: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Project data failed validation.',
      details: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    },
  });
}

function toAdmin(doc) {
  const { _id, __v, ...rest } = doc.toObject();
  return { id: String(_id), ...rest };
}

function idOr400(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ ok: false, error: { code: 'INVALID_ID', message: 'Project id is not valid.' } });
    return null;
  }
  return req.params.id;
}

function notFound(res) {
  res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Project not found.' } });
}

function slugConflict(res, slug) {
  res.status(409).json({ ok: false, error: { code: 'SLUG_CONFLICT', message: `Slug "${slug}" is already used.` } });
}

function stripUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

// GET /api/v1/admin/projects - list across all statuses (optional ?status=).
router.get('/', wrap(async (req, res) => {
  const filter = {};
  if (typeof req.query.status === 'string' && req.query.status) {
    if (!['draft', 'published', 'archived'].includes(req.query.status)) {
      return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Unknown status filter.' } });
    }
    filter.status = req.query.status;
  }
  const docs = await Project.find(filter).sort({ displayOrder: 1, createdAt: -1 });
  res.json({ ok: true, data: docs.map(toAdmin) });
}));

// POST /api/v1/admin/projects - create (slug auto-derived from title when absent).
router.post('/', wrap(async (req, res) => {
  const parsed = projectCreateSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const data = parsed.data;
  if (!data.slug) {
    data.slug = slugify(data.title);
    if (!data.slug) {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Cannot derive a slug from this title - provide a slug explicitly.' },
      });
    }
  }

  const clash = await Project.exists({ slug: data.slug });
  if (clash) return slugConflict(res, data.slug);

  try {
    const doc = await Project.create(data);
    res.status(201).json({ ok: true, data: toAdmin(doc) });
  } catch (err) {
    if (err?.code === 11000) return slugConflict(res, data.slug);
    throw err;
  }
}));

// GET /api/v1/admin/projects/:id
router.get('/:id', wrap(async (req, res) => {
  const id = idOr400(req, res);
  if (!id) return;
  const doc = await Project.findById(id);
  if (!doc) return notFound(res);
  res.json({ ok: true, data: toAdmin(doc) });
}));

// PUT /api/v1/admin/projects/:id - merge provided fields; stale versions are
// rejected with 409 (optimistic concurrency, blueprint section 9).
router.put('/:id', wrap(async (req, res) => {
  const id = idOr400(req, res);
  if (!id) return;

  const parsed = projectUpdateSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const { version, ...fields } = parsed.data;
  const data = stripUndefined(fields);

  // Slug only changes when explicitly provided (stable public URLs).
  if (data.slug) {
    const clash = await Project.exists({ slug: data.slug, _id: { $ne: id } });
    if (clash) return slugConflict(res, data.slug);
  }

  const doc = await Project.findOneAndUpdate(
    { _id: id, version },
    { $set: data, $inc: { version: 1 } },
    { returnDocument: 'after', runValidators: true },
  );

  if (!doc) {
    const current = await Project.findById(id);
    if (!current) return notFound(res);
    return res.status(409).json({
      ok: false,
      error: {
        code: 'VERSION_CONFLICT',
        message: `Project was modified elsewhere (server version ${current.version}). Reload and retry.`,
        details: { currentVersion: current.version },
      },
    });
  }

  res.json({ ok: true, data: toAdmin(doc) });
}));

// PATCH /api/v1/admin/projects/:id/status - any valid status (admin-controlled).
router.patch('/:id/status', wrap(async (req, res) => {
  const id = idOr400(req, res);
  if (!id) return;
  const parsed = statusPatchSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const doc = await Project.findOneAndUpdate(
    { _id: id },
    { $set: { status: parsed.data.status }, $inc: { version: 1 } },
    { returnDocument: 'after', runValidators: true },
  );
  if (!doc) return notFound(res);
  res.json({ ok: true, data: toAdmin(doc) });
}));

// PATCH /api/v1/admin/projects/:id/featured
router.patch('/:id/featured', wrap(async (req, res) => {
  const id = idOr400(req, res);
  if (!id) return;
  const parsed = featuredPatchSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const doc = await Project.findOneAndUpdate(
    { _id: id },
    { $set: { featured: parsed.data.featured }, $inc: { version: 1 } },
    { returnDocument: 'after', runValidators: true },
  );
  if (!doc) return notFound(res);
  res.json({ ok: true, data: toAdmin(doc) });
}));

// PATCH /api/v1/admin/projects/:id/order
router.patch('/:id/order', wrap(async (req, res) => {
  const id = idOr400(req, res);
  if (!id) return;
  const parsed = orderPatchSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const doc = await Project.findOneAndUpdate(
    { _id: id },
    { $set: { displayOrder: parsed.data.displayOrder }, $inc: { version: 1 } },
    { returnDocument: 'after', runValidators: true },
  );
  if (!doc) return notFound(res);
  res.json({ ok: true, data: toAdmin(doc) });
}));

// POST /api/v1/admin/projects/:id/restore - archived -> draft (never auto-publishes).
router.post('/:id/restore', wrap(async (req, res) => {
  const id = idOr400(req, res);
  if (!id) return;

  const doc = await Project.findOneAndUpdate(
    { _id: id, status: 'archived' },
    { $set: { status: 'draft' }, $inc: { version: 1 } },
    { returnDocument: 'after', runValidators: true },
  );
  if (!doc) {
    const exists = await Project.exists({ _id: id });
    if (!exists) return notFound(res);
    return res.status(409).json({
      ok: false,
      error: { code: 'NOT_ARCHIVED', message: 'Only archived projects can be restored.' },
    });
  }
  res.json({ ok: true, data: toAdmin(doc) });
}));

// DELETE /api/v1/admin/projects/:id - explicit confirmation required plus a
// Cloudinary reference check (section 8); asset cleanup arrives with Phase 4.
router.delete('/:id', wrap(async (req, res) => {
  const id = idOr400(req, res);
  if (!id) return;

  const confirmed = req.query.confirm === 'true' || req.body?.confirm === true;
  if (!confirmed) {
    return res.status(400).json({
      ok: false,
      error: { code: 'CONFIRMATION_REQUIRED', message: 'Permanent deletion requires explicit confirmation (?confirm=true).' },
    });
  }

  const doc = await Project.findById(id);
  if (!doc) return notFound(res);

  const cloudinaryRefs = doc.media.filter((m) => m.publicId);
  if (cloudinaryRefs.length > 0) {
    return res.status(409).json({
      ok: false,
      error: {
        code: 'MEDIA_REFERENCES',
        message: `${cloudinaryRefs.length} Cloudinary asset(s) are still referenced. Detach them first (edit the project and remove the media rows), then delete the freed assets separately.`,
      },
    });
  }

  await doc.deleteOne();
  res.json({ ok: true, data: { id, deleted: true } });
}));

export default router;
