import { Router } from 'express';
import Project from '../../models/Project.js';
import { wrap } from '../../utils/asyncHandler.js';

const router = Router();

// GET /api/v1/categories - derived from published project records
// (no separate category collection; blueprint section 5).
router.get('/categories', wrap(async (req, res) => {
  const data = await Project.aggregate([
    { $match: { status: 'published' } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $project: { _id: 0, name: '$_id', count: 1 } },
    { $sort: { name: 1 } },
  ]);
  res.json({ ok: true, data });
}));

export default router;
