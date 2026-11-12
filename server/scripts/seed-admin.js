// Seeds (or updates) the single admin account from .env credentials.
// Usage: npm run seed:admin
// Credentials are NEVER invented: ADMIN_EMAIL / ADMIN_PASSWORD must be set
// in .env first, and are never printed or committed.
import bcrypt from 'bcryptjs';
import { loadConfig, ConfigError } from '../config/env.js';
import { connectDb, disconnectDb } from '../config/db.js';
import Admin from '../models/Admin.js';

const MIN_PASSWORD_LENGTH = 12;

async function main() {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[seed-admin] ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';

  if (!email || !password) {
    console.error('[seed-admin] ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env before seeding.');
    process.exit(1);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`[seed-admin] ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exit(1);
  }

  await connectDb(config);

  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await Admin.findOne({ email });

  if (existing) {
    existing.passwordHash = passwordHash;
    await existing.save();
    console.log(`[seed-admin] Updated credentials for ${email}`);
  } else {
    await Admin.create({ email, passwordHash, role: 'admin' });
    console.log(`[seed-admin] Created admin account ${email}`);
  }

  await disconnectDb();
}

main().catch((err) => {
  console.error(`[seed-admin] Failed: ${err?.message ?? err}`);
  process.exit(1);
});
