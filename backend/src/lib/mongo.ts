import mongoose from 'mongoose';
import { getEnvironment } from '../config/env.js';

type ConnectionCache = {
  connection: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalCache = globalThis as typeof globalThis & {
  __unicircleMongo?: ConnectionCache;
};

const cache = globalCache.__unicircleMongo ??= { connection: null, promise: null };

export async function connectDatabase(): Promise<typeof mongoose> {
  if (cache.connection && mongoose.connection.readyState === 1) return cache.connection;

  if (!cache.promise) {
    const env = getEnvironment();
    cache.promise = mongoose.connect(env.MONGODB_URI, {
      dbName: env.MONGODB_DB_NAME,
      autoIndex: false,
      serverSelectionTimeoutMS: 5_000,
      maxPoolSize: 10,
      minPoolSize: 0,
    }).then((connection) => {
      cache.connection = connection;
      return connection;
    }).catch((error: unknown) => {
      cache.promise = null;
      throw error;
    });
  }

  return cache.promise;
}

export async function disconnectDatabase(): Promise<void> {
  cache.connection = null;
  cache.promise = null;
  await mongoose.disconnect();
}
