import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import Project from '../../models/Project.js';
import { requireAdmin } from '../../middleware/auth.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { runImageUpload, looksLikeImage } from '../../middleware/upload.js';
import { uploadImage, destroyImage } from '../../config/cloudinary.js';
import { wrap } from '../../utils/asyncHandler.js';

const router = Router();

// Every route here mutates storage: session identity + CSRF both required.
router.use(requireAdmin);
router.use(requireCsrf);

// Uploads are comparatively expensive: stricter limit than the general API.
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    ok: false,
    error: { code: 'RATE_LIMITED', message: 'Too many uploads. Try again in 15 minutes.' },
  },
});

// Only assets inside this project's own folder may be destroyed.
const OWN_PUBLIC_ID = /^bayo-portfolio\/[A-Za-z0-9][A-Za-z0-9_-]{0,180}$/;

// POST /api/v1/admin/uploads - multipart image upload (field name: "image").
router.post('/', uploadLimiter, runImageUpload, wrap(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      ok: false,
      error: { code: 'FILE_REQUIRED', message: 'Attach an image in the "image" form field.' },
    });
  }
  if (!looksLikeImage(req.file.buffer)) {
    return res.status(400).json({
      ok: false,
      error: { code: 'UNSUPPORTED_TYPE', message: 'File contents do not match an allowed image format.' },
    });
  }

  try {
    const result = await uploadImage(req.file.buffer);
    res.status(201).json({
      ok: true,
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
      },
    });
  } catch (err) {
    console.error(`[uploads] cloudinary upload failed: ${err?.message ?? err}`);
    res.status(502).json({
      ok: false,
      error: { code: 'UPLOAD_FAILED', message: 'The image storage service rejected the upload.' },
    });
  }
}));

// DELETE /api/v1/admin/uploads?publicId=... - reference-checked destroy.
// Order per audit section 11: projects are updated first (client saves the
// detached record), then the asset is destroyed; never the other way round.
router.delete('/', wrap(async (req, res) => {
  const publicId = typeof req.query.publicId === 'string' ? req.query.publicId.trim() : '';
  if (!publicId || !OWN_PUBLIC_ID.test(publicId)) {
    return res.status(400).json({
      ok: false,
      error: { code: 'INVALID_PUBLIC_ID', message: 'publicId must reference the bayo-portfolio folder.' },
    });
  }

  const rx = new RegExp(publicId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const referenced = await Project.countDocuments({
    $or: [
      { 'media.publicId': publicId },
      { 'media.url': rx },
      { 'seo.image': rx },
      { 'sections.images.publicId': publicId },
      { 'sections.images.url': rx },
      { 'sections.before.url': rx },
      { 'sections.after.url': rx },
      { 'sections.steps.image.url': rx },
    ],
  });
  if (referenced > 0) {
    return res.status(409).json({
      ok: false,
      error: {
        code: 'MEDIA_REFERENCES',
        message: `${referenced} project(s) still reference this image. Detach it from them first.`,
      },
    });
  }

  try {
    const result = await destroyImage(publicId);
    if (result?.result === 'error') {
      return res.status(502).json({
        ok: false,
        error: { code: 'DESTROY_FAILED', message: 'The image storage service rejected the deletion.' },
      });
    }
    res.json({
      ok: true,
      data: { publicId, deleted: true, alreadyAbsent: result?.result === 'not found' },
    });
  } catch (err) {
    console.error(`[uploads] cloudinary destroy failed: ${err?.message ?? err}`);
    res.status(502).json({
      ok: false,
      error: { code: 'DESTROY_FAILED', message: 'The image storage service rejected the deletion.' },
    });
  }
}));

export default router;
