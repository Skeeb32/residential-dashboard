import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI ?? process.env.MONGO_URI;
if (!uri) {
  throw new Error('Set MONGO_URI or MONGODB_URI to an Atlas deployment.');
}

const definition = JSON.parse(
  await readFile(
    new URL('../src/lib/rag/atlas-vector-index.json', import.meta.url),
    'utf8',
  ),
);

try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const collection = mongoose.connection.db.collection('assistant_chunks');
  const indexes = await collection.listSearchIndexes().toArray();
  const existing = indexes.find(
    (index) => index.name === 'mogul_assistant_vectors',
  );

  if (existing) {
    await collection.updateSearchIndex('mogul_assistant_vectors', definition);
    console.log('Updated Atlas Vector Search index: mogul_assistant_vectors');
  } else {
    await collection.createSearchIndex({
      name: 'mogul_assistant_vectors',
      definition,
    });
    console.log('Created Atlas Vector Search index: mogul_assistant_vectors');
  }
} catch {
  console.error(
    'Could not create the vector index. Verify this is MongoDB Atlas and the user can manage search indexes.',
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
