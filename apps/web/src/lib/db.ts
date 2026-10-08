import mongoose from 'mongoose';
import { activateLocalDemoStore } from './local-demo-store';

type MongooseCache = {
  connection: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  usingLocalDemoStore: boolean;
};

const globalForMongoose = globalThis as typeof globalThis & {
  mongooseCache?: MongooseCache;
};

const cache = (globalForMongoose.mongooseCache ??= {
  connection: null,
  promise: null,
  usingLocalDemoStore: false,
});

export async function connectToDatabase(): Promise<typeof mongoose | null> {
  if (cache.usingLocalDemoStore) return null;
  if (cache.connection) return cache.connection;

  const configuredUri = process.env.MONGODB_URI ?? process.env.MONGO_URI;
  const uri = configuredUri ?? 'mongodb://127.0.0.1:27017/mogul_db';
  const allowMemoryFallback =
    process.env.NODE_ENV !== 'production' && !configuredUri;

  cache.promise ??= mongoose.connect(uri, {
    bufferCommands: false,
    serverSelectionTimeoutMS: 5000,
  });

  try {
    cache.connection = await cache.promise;
    return cache.connection;
  } catch (error) {
    cache.promise = null;

    if (!allowMemoryFallback) throw error;

    activateLocalDemoStore();
    cache.usingLocalDemoStore = true;
    console.warn(
      'MongoDB is unavailable; using temporary development data. It will be lost when the dev server stops.',
    );
    return null;
  }
}
