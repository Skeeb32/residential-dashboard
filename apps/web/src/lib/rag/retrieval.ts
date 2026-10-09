import {
  getUserAssistantChunks,
  searchAtlasVectorChunks,
  type AssistantChunk,
  type AssistantCitation,
} from '@/lib/assistant/store';
import { getOpenAIClient, hasOpenAIKey } from '@/lib/assistant/openai';
import { tokenize } from './text';

export type RetrievedEvidence = {
  text: string;
  score: number;
  citation: AssistantCitation;
};

function cosineSimilarity(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }
  const denominator = Math.sqrt(leftMagnitude * rightMagnitude);
  return denominator ? dot / denominator : 0;
}

function lexicalScores(query: string, chunks: AssistantChunk[]) {
  const queryTokens = tokenize(query);
  const documents = chunks.map((chunk) => tokenize(chunk.text));
  const averageLength =
    documents.reduce((sum, tokens) => sum + tokens.length, 0) /
      Math.max(documents.length, 1) || 1;
  const documentFrequency = new Map<string, number>();

  for (const tokens of documents) {
    for (const term of new Set(tokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  return documents.map((tokens) => {
    const termCounts = new Map<string, number>();
    for (const term of tokens) {
      termCounts.set(term, (termCounts.get(term) ?? 0) + 1);
    }

    let score = 0;
    for (const term of queryTokens) {
      const frequency = termCounts.get(term) ?? 0;
      if (!frequency) continue;
      const docsWithTerm = documentFrequency.get(term) ?? 0;
      const inverseDocumentFrequency = Math.log(
        1 + (chunks.length - docsWithTerm + 0.5) / (docsWithTerm + 0.5),
      );
      const lengthNormalization =
        1.5 * (1 - 0.75 + 0.75 * (tokens.length / averageLength));
      score +=
        inverseDocumentFrequency *
        ((frequency * (1.5 + 1)) / (frequency + lengthNormalization));
    }
    return score;
  });
}

function reciprocalRankFusion(rankLists: number[][], count: number) {
  const scores = new Map<number, number>();
  for (const list of rankLists) {
    list.forEach((chunkIndex, rank) => {
      scores.set(
        chunkIndex,
        (scores.get(chunkIndex) ?? 0) + 1 / (60 + rank + 1),
      );
    });
  }
  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, count);
}

function toEvidence(chunk: AssistantChunk, score: number): RetrievedEvidence {
  return {
    text: chunk.text,
    score,
    citation: {
      documentId: chunk.documentId,
      title: chunk.title,
      sourceType: chunk.sourceType,
      url: chunk.url,
      page: chunk.page,
      chunkId: chunk.id,
    },
  };
}

export async function retrieveEvidence(
  userId: string,
  query: string,
  filters: { propertyId?: string; sourceType?: string } = {},
  limit = 6,
): Promise<RetrievedEvidence[]> {
  const chunks = await getUserAssistantChunks(userId, filters);
  if (!chunks.length) return [];

  const lexical = lexicalScores(query, chunks);
  const lexicalOrder = lexical
    .map((score, index) => ({ score, index }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.index);

  let vectorOrder: number[] = [];
  if (hasOpenAIKey()) {
    const response = await getOpenAIClient().embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });
    const queryVector = response.data[0]?.embedding ?? [];
    const atlasMatches = await searchAtlasVectorChunks(
      userId,
      queryVector,
      Math.max(limit * 3, 12),
      filters,
    );

    if (atlasMatches?.length) {
      const indexById = new Map(
        chunks.map((chunk, index) => [chunk.id, index]),
      );
      vectorOrder = atlasMatches
        .map((chunk) => indexById.get(chunk.id))
        .filter((index): index is number => index !== undefined);
    } else {
      vectorOrder = chunks
        .map((chunk, index) => ({
          index,
          score: chunk.embedding
            ? cosineSimilarity(queryVector, chunk.embedding)
            : 0,
        }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, Math.max(limit * 3, 12))
        .map((entry) => entry.index);
    }
  }

  const fused = reciprocalRankFusion(
    [vectorOrder, lexicalOrder].filter((ranked) => ranked.length > 0),
    limit,
  );
  return fused
    .filter(([index]) => lexical[index] > 0 || vectorOrder.includes(index))
    .map(([index, score]) => toEvidence(chunks[index], score));
}
