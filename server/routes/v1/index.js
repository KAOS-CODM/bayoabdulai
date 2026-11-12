import { Router } from 'express';
import { connectionState } from '../../config/db.js';
import projectsRouter from './projects.js';
import categoriesRouter from './categories.js';
import adminAuthRouter from '../admin/auth.js';
import adminProjectsRouter from '../admin/projects.js';
import adminUploadsRouter from '../admin/uploads.js';

const router = Router();

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    status: 'ok',
    service: 'bayo-portfolio-api',
    time: new Date().toISOString(),
    uptimeSec: Math.round(process.uptime()),
    db: connectionState(),
  });
});

router.use('/projects', projectsRouter);
router.use('/', categoriesRouter);
router.use('/admin/auth', adminAuthRouter);
router.use('/admin/projects', adminProjectsRouter);
router.use('/admin/uploads', adminUploadsRouter);

export default router;
