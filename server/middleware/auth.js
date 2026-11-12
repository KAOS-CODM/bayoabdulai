// Every admin endpoint requires an authenticated session identity.
// Phase 3 adds login/logout (POST /api/v1/admin/auth/*) which populate
// req.session.adminId; until then all admin endpoints answer 401.
export function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) return next();
  res.status(401).json({
    ok: false,
    error: { code: 'UNAUTHORIZED', message: 'Admin authentication required.' },
  });
}

// Page-route variant (Phase 5 preview): same session contract as requireAdmin,
// but browsers get redirected to the admin login shell instead of JSON.
export function requireAdminPage(req, res, next) {
  if (req.session && req.session.adminId) return next();
  res.redirect('/admin');
}
