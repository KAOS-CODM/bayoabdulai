// 404 + centralized error responses: JSON under /api, styled HTML elsewhere.
// 5xx responses never leak internals.

import path from 'node:path';
import { PUBLIC_DIR } from '../routes/pages.js';

const NOT_FOUND_PAGE = path.join(PUBLIC_DIR, '404.html');

// Minimal fallback only used if public/404.html cannot be read.
const SITE_404 = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>404 - Not found</title></head>
<body style="font-family: system-ui, sans-serif; padding: 48px 20px;"><h1 style="font-size: 28px;">404 - Page not found</h1><p><a href="/">Back to the homepage</a></p></body></html>`;

function siteErrorPage(status, message) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${status} - Error</title></head>
<body style="font-family: system-ui, sans-serif; padding: 48px 20px;"><h1 style="font-size: 28px;">${status}</h1><p>${message}</p><p><a href="/">Back to the homepage</a></p></body></html>`;
}

function isApiRequest(req) {
  return req.path === '/api' || req.path.startsWith('/api/');
}

export function notFoundHandler(req, res) {
  // API detection must run first so an API miss can never be served the HTML page.
  if (isApiRequest(req)) {
    res.status(404).json({
      ok: false,
      error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
    });
    return;
  }

  res.status(404).sendFile(NOT_FOUND_PAGE, (err) => {
    if (!err || res.headersSent) return;
    // Keep the 404 status even if the styled page is unavailable.
    res.type('html').send(SITE_404);
  });
}

export function errorHandler(err, req, res, _next) {
  const status = Number(err.status || err.statusCode || 500);
  const isInternal = status >= 500;

  console.error(`[error] ${req.method} ${req.originalUrl} -> ${status} ${err.message}`);

  if (isApiRequest(req)) {
    const code = !isInternal && typeof err.code === 'string' ? err.code : (isInternal ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
    res.status(status).json({
      ok: false,
      error: { code, message: isInternal ? 'Something went wrong on the server.' : err.message },
    });
    return;
  }

  res.status(status).type('html').send(
    isInternal
      ? siteErrorPage(status, 'Something went wrong. Please try again later.')
      : siteErrorPage(status, 'The request could not be completed.')
  );
}
