import mongoose from 'mongoose';
import { configureDns } from './dns.js';

const STATE_NAMES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

export function connectionState() {
  return STATE_NAMES[mongoose.connection.readyState] ?? 'unknown';
}

export async function connectDb({ mongoUri, mongoDbName, log = console }) {
  configureDns();
  mongoose.set('strictQuery', true);

  if (mongoose.connection.readyState === 0 && !mongoose.connection.eventNames().includes('error')) {
    mongoose.connection.on('error', (err) => log.error(`[db] connection error: ${err.message}`));
    mongoose.connection.on('disconnected', () => log.warn('[db] disconnected'));
  }

  await mongoose.connect(mongoUri, {
    dbName: mongoDbName,
    serverSelectionTimeoutMS: 8000,
    maxPoolSize: 10,
  });

  log.log(`[db] connected to database "${mongoDbName}"`);
  return mongoose.connection;
}

export async function disconnectDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
