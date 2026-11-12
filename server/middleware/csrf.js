import crypto from 'node:crypto';

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

// Double-submit CSRF: the token lives in the session AND in a JS-readable
// cookie; mutating requests must echo it in the x-csrf-token header.
export function csrfValid(req) {
  const header = req.get('x-csrf-token') || '';
  const expected = req.session?.csrfToken || '';
  if (!header || !expected) return false;
  return crypto.timingSafeEqual(sha(header), sha(expected));
}

export function requireCsrf(req, res, next) {
  if (csrfValid(req)) return next();
  res.status(403).json({
    ok: false,
    error: { code: 'CSRF_FAILED', message: 'Invalid or missing CSRF token.' },
  });
}
