# Changelog

All notable changes to the Bayo Abdulai Badmus Portfolio will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-12

### Added
- **Frontend-to-Backend Render Integration** (this commit)
  - Configured `API_BASE` auto-detection in `public/js/api.js` and `public/js/admin.js`:
    - Localhost: relative URLs for local development
    - Render production: `https://bayoabdulai-api.onrender.com`
  - All API requests now target the backend service:
    - `fetchFeaturedProjects()`, `fetchPublishedProjects()`, `fetchAllPublishedProjects()`, `fetchCategories()`
    - Admin login, session persistence, CSRF-protected CRUD operations
    - Upload and project editor flows
  - Added `credentials: 'include'` to all cross-origin fetch requests
  - CSRF token persistence via `localStorage` (`bayo_csrf_token`) to solve cross-origin cookie reading limitation
  - Backend CORS configured for exactly `https://bayoabdulai.onrender.com`:
    - Credentialed access only (no wildcard origins with credentials)
    - OPTIONS preflight handled before session/auth middleware
    - `Vary: Origin` header included
  - Helmet CSP updated: `connectSrc` now permits `https://bayoabdulai-api.onrender.com`
  - Environment-aware API base works sitewide: local dev and deployed Render

### Changed
- `public/js/api.js` — Rewrote API utility with backend base URL, consolidated all project listing, featured, categories, and auth requests to use the backend service with `credentials: 'include'`
- `public/js/admin.js` — Rewrote admin API client:
  - Environment-aware `API_BASE` (same as api.js)
  - CSRF token stored in `localStorage` after login (mirrors httpOnly=false cookie from backend origin)
  - `readCsrf()` checks localStorage first, then document.cookie fallback
  - `storeCsrfToken()` mirrors token into localStorage for persistence across reloads/sessions
  - All fetch calls use `${API_BASE}${path}` with credentials
  - Login handler stores CSRF token automatically
- `server/app.js` — Added CORS middleware inside `createApp()`:
  - Credentialed CORS for `https://bayoabdulai.onrender.com` only
  - Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
  - Headers: Content-Type, x-csrf-token, Authorization
  - Exposes `x-csrf-token` header to frontend
  - `Vary: Origin` header for cache correctness
  - OPTIONS preflight completed immediately before session/auth middleware
  - Helmet CSP: added `https://bayoabdulai-api.onrender.com` to `connectSrc` directive
- `public/js/theme.js`, `public/js/admin.js`, `public/js/nav.js` — No functional changes; preserved as-is

### Fixed
- **Cross-origin CSRF token accessibility**: The `bayo_csrf` cookie set by the backend on the API origin (`https://bayoabdulai-api.onrender.com`) is not readable by frontend JavaScript on the different frontend origin (`https://bayoabdulai.onrender.com`). Fixed by mirroring the token into `localStorage` after login, providing a safe mechanism that persists across page reloads and new admin sessions without weakening CSRF validation or broadening cookie domain.
- **API requests hitting frontend instead of backend**: All relative `/api/v1/...` requests from the frontend now resolve against the correct backend service URL via the `API_BASE` constant.
- **CORS preflight before session middleware**: OPTIONS preflight requests are now handled immediately by the new CORS middleware, before session/auth middleware runs, preventing 401/403 errors on preflight checks.
- **Backend connections blocked by CSP**: Helmet CSP `connectSrc` now permits connections to `https://bayoabdulai-api.onrender.com`, allowing frontend fetch requests with `credentials: 'include'` to reach the backend API.

### Security
- No wildcard CORS origins with credentials (specific origin only)
- Session cookies remain HttpOnly, secure (production), sameSite=lax
- CSRF validation preserved (double-submit pattern: token in session + token in x-csrf-token header)
- No secrets exposed or printed
- CSP preserves existing security restrictions (script/style sources unchanged)

## [Previous Versions]

### Unreleased
- Initial project setup and audit phases (documented in project files:
  - `PHASE_1_TO_7_FINAL_MULTI_COMMIT_REPORT.md`
  - `PHASE_7_FRONTEND_INTEGRATION_AUDIT.md`
  - `PHASE_7_FRONTEND_INTEGRATION_REPORT.md`
  - Various phase audit/report files in the repository)
- These cover the project history from early phases through the current integration fix.

---
*Generated automatically. See git history for individual commit details.*