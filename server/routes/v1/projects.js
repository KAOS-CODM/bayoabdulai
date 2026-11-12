import { Router } from 'express';
import Project from '../../models/Project.js';
import { wrap } from '../../utils/asyncHandler.js';

const router = Router();

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function toPublic(doc) {
  const { _id, __v, ...rest } = doc.toObject();
  return { id: String(_id), ...rest };
}

function parsePagination(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit, 10) || 12));
  return { page, limit };
}

// GET /api/v1/projects - published only, admin-defined order, filter + search.
router.get('/', wrap(async (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const filter = { status: 'published' };

  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  if (category) filter.category = category;

  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ title: rx }, { shortDescription: rx }, { tags: rx }];
  }

  const [total, docs] = await Promise.all([
    Project.countDocuments(filter),
    Project.find(filter)
      .sort({ displayOrder: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);

  res.json({
    ok: true,
    data: docs.map(toPublic),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}));

// GET /api/v1/projects/featured - must be defined before /:slug.
router.get('/featured', wrap(async (req, res) => {
  const docs = await Project.find({ status: 'published', featured: true })
    .sort({ displayOrder: 1, createdAt: -1 })
    .limit(50);
  res.json({ ok: true, data: docs.map(toPublic) });
}));

// GET /api/v1/projects/:slug - drafts and archived projects are never public.
router.get('/:slug', wrap(async (req, res) => {
  const slug = String(req.params.slug).toLowerCase();
  const doc = await Project.findOne({ slug, status: 'published' });
  if (!doc) {
    return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Project not found.' } });
  }
  res.json({ ok: true, data: toPublic(doc) });
}));

export default router;
