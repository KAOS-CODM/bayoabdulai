import multer from 'multer';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB cap (audit section 11)
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
// SVG is intentionally NOT allowed: it is an XSS vector (audit section 11).

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      const err = new Error('unsupported image type');
      err.code = 'UNSUPPORTED_TYPE';
      cb(err);
      return;
    }
    cb(null, true);
  },
});

// Wraps multer so its errors become the standard JSON error envelope.
export function runImageUpload(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        ok: false,
        error: { code: 'FILE_TOO_LARGE', message: 'Images must be 5 MB or smaller.' },
      });
    }
    if (err.code === 'UNSUPPORTED_TYPE') {
      return res.status(400).json({
        ok: false,
        error: { code: 'UNSUPPORTED_TYPE', message: 'Only PNG, JPEG and WebP images are allowed.' },
      });
    }
    return res.status(400).json({
      ok: false,
      error: { code: 'UPLOAD_ERROR', message: 'The upload could not be processed.' },
    });
  });
}

// The declared mimetype is client-controlled, so verify magic bytes:
// PNG \x89PNG, JPEG \xFF\xD8\xFF, WebP RIFF....WEBP.
export function looksLikeImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isWebp = buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return isPng || isJpeg || isWebp;
}
