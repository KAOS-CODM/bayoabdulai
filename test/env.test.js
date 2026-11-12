import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, ConfigError } from '../server/config/env.js';

const VALID = {
  MONGODB_URI: 'mongodb+srv://user:pass@cluster0.example.mongodb.net/',
  SESSION_SECRET: 's'.repeat(48),
  CLOUDINARY_CLOUD_NAME: 'test-cloud',
  CLOUDINARY_API_KEY: '123456789',
  CLOUDINARY_API_SECRET: 'test-secret-value',
};

test('loadConfig reports every missing key by name', () => {
  assert.throws(
    () => loadConfig({}),
    (err) => err instanceof ConfigError
      && err.missing.includes('MONGODB_URI')
      && err.missing.includes('SESSION_SECRET')
      && err.missing.includes('CLOUDINARY_CLOUD_NAME')
      && err.missing.includes('CLOUDINARY_API_KEY')
      && err.missing.includes('CLOUDINARY_API_SECRET')
  );
});

test('loadConfig rejects a short session secret', () => {
  assert.throws(
    () => loadConfig({ ...VALID, SESSION_SECRET: 'too-short' }),
    (err) => err instanceof ConfigError && err.missing.some((k) => k.startsWith('SESSION_SECRET'))
  );
});

test('loadConfig rejects a non-mongo URI', () => {
  assert.throws(
    () => loadConfig({ ...VALID, MONGODB_URI: 'https://example.com' }),
    (err) => err instanceof ConfigError && err.missing.some((k) => k.startsWith('MONGODB_URI'))
  );
});

test('loadConfig returns a frozen config with safe defaults', () => {
  const config = loadConfig({ ...VALID });
  assert.ok(Object.isFrozen(config));
  assert.equal(config.mongoDbName, 'bayo-portfolio');
  assert.equal(config.port, 3000);
  assert.equal(config.nodeEnv, 'production'); // safe default when NODE_ENV unset
  assert.equal(config.isProduction, true);
  assert.equal(config.sessionTtlMs, 8 * 60 * 60 * 1000);
  assert.equal(config.cloudinary.cloudName, 'test-cloud');
});

test('NODE_ENV=development flips isProduction off', () => {
  const config = loadConfig({ ...VALID, NODE_ENV: 'development' });
  assert.equal(config.isProduction, false);
});
