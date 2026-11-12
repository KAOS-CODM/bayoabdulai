// Wraps async route handlers so rejections reach the error middleware.
// Works on Express 4 and 5 (Express 5 forwards them natively, but this keeps
// behavior explicit and version-independent).
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
