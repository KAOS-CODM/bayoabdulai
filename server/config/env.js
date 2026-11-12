// Environment loading + validation.
// Fails fast with missing KEY NAMES only — values are never printed.

export class ConfigError extends Error {
  constructor(missing) {
    super(`Missing or invalid environment configuration: ${missing.join(', ')}`);
    this.name = 'ConfigError';
    this.missing = missing;
  }
}

const MIN_SECRET_LENGTH = 32;

export function loadConfig(env = process.env) {
  const missing = [];

  const get = (key, fallback = '') => {
    const raw = env[key];
    if (raw === undefined || raw === null) return fallback;
    const value = String(raw).trim();
    return value === '' ? fallback : value;
  };

  const nodeEnv = get('NODE_ENV', 'production');

  const mongoUri = get('MONGODB_URI');
  if (!mongoUri) missing.push('MONGODB_URI');
  else if (!/^mongodb(\+srv)?:\/\//.test(mongoUri)) missing.push('MONGODB_URI (must start with mongodb:// or mongodb+srv://)');

  const sessionSecret = get('SESSION_SECRET');
  if (!sessionSecret) missing.push('SESSION_SECRET');
  else if (sessionSecret.length < MIN_SECRET_LENGTH) missing.push(`SESSION_SECRET (min ${MIN_SECRET_LENGTH} characters)`);

  const port = Number(get('PORT', '3000'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) missing.push('PORT (must be 1-65535)');

  const ttlHours = Number(get('SESSION_TTL_HOURS', '8'));
  if (!Number.isFinite(ttlHours) || ttlHours <= 0) missing.push('SESSION_TTL_HOURS (must be > 0)');

  // Cloudinary is required from Phase 4 on: fail fast at boot rather than
  // surfacing 503s on the first upload in a deployed environment.
  const cloudinary = Object.freeze({
    cloudName: get('CLOUDINARY_CLOUD_NAME'),
    apiKey: get('CLOUDINARY_API_KEY'),
    apiSecret: get('CLOUDINARY_API_SECRET'),
  });
  if (!cloudinary.cloudName) missing.push('CLOUDINARY_CLOUD_NAME');
  if (!cloudinary.apiKey) missing.push('CLOUDINARY_API_KEY');
  if (!cloudinary.apiSecret) missing.push('CLOUDINARY_API_SECRET');

  if (missing.length > 0) throw new ConfigError(missing);

  return Object.freeze({
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port,
    mongoUri,
    mongoDbName: get('MONGODB_DB_NAME', 'bayo-portfolio'),
    sessionSecret,
    sessionTtlMs: Math.round(ttlHours * 60 * 60 * 1000),
    siteUrl: get('SITE_URL', `http://localhost:${port}`),
    jsonBodyLimit: get('JSON_BODY_LIMIT', '256kb'),
    admin: Object.freeze({ email: get('ADMIN_EMAIL'), password: get('ADMIN_PASSWORD') }),
    cloudinary,
  });
}
