import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDb, disconnectDb, connectionState } from '../server/config/db.js';

const mongoUri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'bayo-portfolio';
const skip = mongoUri ? false : 'skipped: no .env / MONGODB_URI';

const silentLog = { log() {}, warn() {}, error() {} };

describe('MongoDB connectivity', { skip }, () => {
  before(async () => {
    await connectDb({ mongoUri, mongoDbName: dbName, log: silentLog });
  });

  after(async () => {
    await disconnectDb();
  });

  it('connects and answers ping', async () => {
    assert.equal(connectionState(), 'connected');
    const result = await mongoose.connection.db.admin().command({ ping: 1 });
    assert.equal(result.ok, 1);
  });

  it('uses the isolated database name', () => {
    assert.equal(mongoose.connection.db.databaseName, dbName);
  });
});
