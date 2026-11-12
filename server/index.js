// Entry point: validate env -> connect MongoDB -> create app -> listen.
import { loadConfig, ConfigError } from './config/env.js';
import { connectDb, disconnectDb } from './config/db.js';
import { createApp } from './app.js';

async function main() {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[config] ${err.message}`);
      console.error('[config] Copy .env.example to .env and fill in the values.');
      process.exit(1);
    }
    throw err;
  }

  try {
    await connectDb(config);
  } catch (err) {
    console.error(`[db] Could not connect: ${err.message}`);
    process.exit(1);
  }

  const app = createApp(config);
  const server = app.listen(config.port, () => {
    console.log(`[server] listening on http://localhost:${config.port} (${config.nodeEnv})`);
  });

  const shutdown = (signal) => {
    console.log(`[server] ${signal} received - shutting down`);
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(`[fatal] ${err?.message ?? err}`);
  process.exit(1);
});
