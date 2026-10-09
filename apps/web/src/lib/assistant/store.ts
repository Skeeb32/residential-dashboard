import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db';

export type AssistantCitation = {
  documentId: string;
  title: string;
  sourceType: string;
  url?: string;
  page?: number;
  chunkId: string;
};

export type AssistantMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: AssistantCitation[];
  createdAt: string;
};

export type AssistantConversation = {
  id: string;
  userId: string;
  title: string;
  messages: AssistantMessage[];
  createdAt: string;
  updatedAt: string;
};

export type AssistantDocument = {
  id: string;
  userId: string;
  title: string;
  sourceType: 'pdf' | 'docx' | 'html' | 'csv' | 'text' | 'listing' | 'note';
  url?: string;
  propertyId?: string;
  checksum: string;
  createdAt: string;
};

export type AssistantChunk = {
  id: string;
  documentId: string;
  userId: string;
  accountId?: string;
  propertyId?: string;
  sourceType: AssistantDocument['sourceType'];
  title: string;
  url?: string;
  page?: number;
  chunkIndex: number;
  text: string;
  embedding?: number[];
  createdAt: string;
};

type LocalAssistantStore = {
  documents: Map<string, AssistantDocument>;
  chunks: Map<string, AssistantChunk>;
  conversations: Map<string, AssistantConversation>;
  audits: Array<Record<string, unknown>>;
};

const globalForAssistantStore = globalThis as typeof globalThis & {
  localAssistantStore?: LocalAssistantStore;
};

const localStore = (globalForAssistantStore.localAssistantStore ??= {
  documents: new Map(),
  chunks: new Map(),
  conversations: new Map(),
  audits: [],
});

const indexedConnections = new WeakSet<object>();

async function getCollections() {
  const mongoose = await connectToDatabase();
  if (!mongoose) return null;
  const database = mongoose.connection.db;
  if (!database) throw new Error('MongoDB connection is not ready.');

  if (!indexedConnections.has(database)) {
    await Promise.all([
      database
        .collection('assistant_documents')
        .createIndex({ userId: 1, checksum: 1 }, { unique: true }),
      database
        .collection('assistant_chunks')
        .createIndex({ userId: 1, documentId: 1 }),
      database
        .collection('assistant_chunks')
        .createIndex({ userId: 1, propertyId: 1 }),
      database
        .collection('assistant_conversations')
        .createIndex({ userId: 1, updatedAt: -1 }),
      database
        .collection('assistant_audit')
        .createIndex({ userId: 1, createdAt: -1 }),
    ]);
    indexedConnections.add(database);
  }

  return {
    documents: database.collection<AssistantDocument>('assistant_documents'),
    chunks: database.collection<AssistantChunk>('assistant_chunks'),
    conversations: database.collection<AssistantConversation>(
      'assistant_conversations',
    ),
    audits: database.collection('assistant_audit'),
  };
}

export async function storeAssistantDocument(
  document: Omit<AssistantDocument, 'id' | 'createdAt'>,
  chunks: Array<
    Omit<AssistantChunk, 'id' | 'documentId' | 'userId' | 'createdAt'>
  >,
) {
  const collections = await getCollections();
  const id = new Types.ObjectId().toHexString();
  const createdAt = new Date().toISOString();
  const record: AssistantDocument = { ...document, id, createdAt };
  const chunkRecords: AssistantChunk[] = chunks.map((chunk, chunkIndex) => ({
    ...chunk,
    id: new Types.ObjectId().toHexString(),
    documentId: id,
    userId: document.userId,
    createdAt,
    chunkIndex,
  }));

  if (!collections) {
    const duplicate = [...localStore.documents.values()].some(
      (existing) =>
        existing.userId === document.userId &&
        existing.checksum === document.checksum,
    );
    if (duplicate) return { document: null, duplicate: true };

    localStore.documents.set(id, record);
    for (const chunk of chunkRecords) localStore.chunks.set(chunk.id, chunk);
    return { document: record, duplicate: false };
  }

  const existing = await collections.documents.findOne({
    userId: document.userId,
    checksum: document.checksum,
  });
  if (existing) return { document: null, duplicate: true };

  await collections.documents.insertOne(record);
  try {
    if (chunkRecords.length) await collections.chunks.insertMany(chunkRecords);
  } catch (error) {
    await collections.documents.deleteOne({ id, userId: document.userId });
    throw error;
  }
  return { document: record, duplicate: false };
}

export async function getUserAssistantDocuments(userId: string) {
  const collections = await getCollections();
  if (!collections) {
    return [...localStore.documents.values()]
      .filter((document) => document.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  return collections.documents
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();
}

export async function deleteUserAssistantDocument(
  userId: string,
  documentId: string,
) {
  const collections = await getCollections();
  if (!collections) {
    const document = localStore.documents.get(documentId);
    if (!document || document.userId !== userId) return false;
    localStore.documents.delete(documentId);
    for (const [chunkId, chunk] of localStore.chunks) {
      if (chunk.userId === userId && chunk.documentId === documentId) {
        localStore.chunks.delete(chunkId);
      }
    }
    return true;
  }

  const result = await collections.documents.deleteOne({
    id: documentId,
    userId,
  });
  if (!result.deletedCount) return false;
  await collections.chunks.deleteMany({ documentId, userId });
  return true;
}

export async function getUserAssistantChunks(
  userId: string,
  filters: { propertyId?: string; sourceType?: string } = {},
) {
  const collections = await getCollections();
  const matches = (chunk: AssistantChunk) =>
    chunk.userId === userId &&
    (!filters.propertyId || chunk.propertyId === filters.propertyId) &&
    (!filters.sourceType || chunk.sourceType === filters.sourceType);

  if (!collections) {
    return [...localStore.chunks.values()].filter(matches).slice(0, 500);
  }

  return collections.chunks
    .find({
      userId,
      ...(filters.propertyId ? { propertyId: filters.propertyId } : {}),
      ...(filters.sourceType ? { sourceType: filters.sourceType } : {}),
    })
    .limit(500)
    .toArray();
}

export async function searchAtlasVectorChunks(
  userId: string,
  queryVector: number[],
  limit: number,
  filters: { propertyId?: string; sourceType?: string } = {},
) {
  const collections = await getCollections();
  if (!collections) return null;

  try {
    const pipeline = [
      {
        $vectorSearch: {
          index: 'mogul_assistant_vectors',
          path: 'embedding',
          queryVector,
          numCandidates: Math.min(limit * 20, 200),
          limit,
          filter: {
            userId: { $eq: userId },
            ...(filters.propertyId
              ? { propertyId: { $eq: filters.propertyId } }
              : {}),
            ...(filters.sourceType
              ? { sourceType: { $eq: filters.sourceType } }
              : {}),
          },
        },
      },
      { $addFields: { vectorScore: { $meta: 'vectorSearchScore' } } },
    ];

    return await collections.chunks
      .aggregate<AssistantChunk & { vectorScore: number }>(pipeline)
      .toArray();
  } catch {
    return null;
  }
}

export async function getAssistantConversation(
  userId: string,
  conversationId: string,
) {
  const collections = await getCollections();
  if (!collections) {
    const conversation = localStore.conversations.get(conversationId);
    return conversation?.userId === userId ? conversation : null;
  }

  return collections.conversations.findOne({ id: conversationId, userId });
}

export async function listAssistantConversations(userId: string) {
  const collections = await getCollections();
  if (!collections) {
    return [...localStore.conversations.values()]
      .filter((conversation) => conversation.userId === userId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 30)
      .map(({ id, title, createdAt, updatedAt }) => ({
        id,
        title,
        createdAt,
        updatedAt,
      }));
  }

  return collections.conversations
    .find({ userId })
    .sort({ updatedAt: -1 })
    .limit(30)
    .project({ id: 1, title: 1, createdAt: 1, updatedAt: 1 })
    .toArray();
}

export async function saveAssistantConversation(
  conversation: AssistantConversation,
) {
  const collections = await getCollections();
  if (!collections) {
    localStore.conversations.set(conversation.id, conversation);
    return conversation;
  }

  await collections.conversations.replaceOne(
    { id: conversation.id, userId: conversation.userId },
    conversation,
    { upsert: true },
  );
  return conversation;
}

export async function writeAssistantAudit(entry: {
  userId: string;
  action: string;
  resourceId?: string;
  outcome: 'success' | 'denied' | 'error';
}) {
  const record = { ...entry, createdAt: new Date().toISOString() };
  const collections = await getCollections();
  if (!collections) {
    localStore.audits.push(record);
    return;
  }
  await collections.audits.insertOne(record);
}

export async function deleteUserAssistantData(userId: string) {
  const collections = await getCollections();
  if (!collections) {
    for (const [id, document] of localStore.documents) {
      if (document.userId === userId) localStore.documents.delete(id);
    }
    for (const [id, chunk] of localStore.chunks) {
      if (chunk.userId === userId) localStore.chunks.delete(id);
    }
    for (const [id, conversation] of localStore.conversations) {
      if (conversation.userId === userId) localStore.conversations.delete(id);
    }
    for (let index = localStore.audits.length - 1; index >= 0; index -= 1) {
      if (localStore.audits[index].userId === userId) {
        localStore.audits.splice(index, 1);
      }
    }
    return;
  }

  await Promise.all([
    collections.documents.deleteMany({ userId }),
    collections.chunks.deleteMany({ userId }),
    collections.conversations.deleteMany({ userId }),
    collections.audits.deleteMany({ userId }),
  ]);
}
