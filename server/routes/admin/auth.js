import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import Admin from '../../models/Admin.js';
import { requireAdmin } from '../../middleware/auth.js';
import { csrfValid } from '../../middleware/csrf.js';
import { wrap } from '../../utils/asyncHandler.js';

const router = Router();

// Strict per-IP limit on login attempts (blueprint section 7).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    ok: false,
    error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again in 15 minutes.' },
  },
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254)
    .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'must be a valid email address'),
  password: z.string().min(1).max(200),
});

// Identical response for unknown email and wrong password (no user enumeration).
const INVALID_CREDENTIALS = {
  ok: false,
  error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
};

function sessionRegenerate(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

function sessionDestroy(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
}

// POST /api/v1/admin/auth/login
router.post('/login', loginLimiter, wrap(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'A valid email and password are required.' },
    });
  }

  const admin = await Admin.findOne({ email: parsed.data.email });
  const passwordOk = admin ? await bcrypt.compare(parsed.data.password, admin.passwordHash) : false;
  if (!passwordOk) return res.status(401).json(INVALID_CREDENTIALS);

  // Regenerate the session on login (session-fixation protection, section 7).
  await sessionRegenerate(req);
  req.session.adminId = String(admin._id);
  req.session.adminEmail = admin.email;
  req.session.adminRole = admin.role;

  const csrfToken = crypto.randomBytes(32).toString('base64url');
  req.session.csrfToken = csrfToken;

  const { isProduction, sessionTtlMs } = req.app.locals.config;
  res.cookie('bayo_csrf', csrfToken, {
    httpOnly: false, // admin JS must read it to echo in x-csrf-token
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    maxAge: sessionTtlMs,
  });

  res.json({ ok: true, data: { email: admin.email, role: admin.role, csrfToken } });
}));

// POST /api/v1/admin/auth/logout (idempotent; CSRF required when a session exists)
router.post('/logout', wrap(async (req, res) => {
  if (req.session?.adminId) {
    if (!csrfValid(req)) {
      return res.status(403).json({
        ok: false,
        error: { code: 'CSRF_FAILED', message: 'Invalid or missing CSRF token.' },
      });
    }
    await sessionDestroy(req);
  }
  res.clearCookie('bayo_csrf', { path: '/' });
  res.clearCookie('bayo.sid', { path: '/' });
  res.json({ ok: true, data: { loggedOut: true } });
}));

// GET /api/v1/admin/auth/me
router.get('/me', requireAdmin, (req, res) => {
  res.json({
    ok: true,
    data: {
      id: req.session.adminId,
      email: req.session.adminEmail,
      role: req.session.adminRole || 'admin',
    },
  });
});

export default router;
