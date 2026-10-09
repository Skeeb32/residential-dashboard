import { createHash } from 'node:crypto';

export function redactSensitiveText(text: string) {
  return text
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED SSN]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED EMAIL]')
    .replace(
      /\b(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/g,
      '[REDACTED PHONE]',
    )
    .replace(/\b(?:\d[ -]?){12,19}\b/g, '[REDACTED ACCOUNT NUMBER]');
}

export function checksumText(text: string) {
  return createHash('sha256').update(text).digest('hex');
}

export function chunkText(text: string, maxCharacters = 1200, overlap = 160) {
  const normalized = text
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + maxCharacters, normalized.length);
    if (end < normalized.length) {
      const paragraphEnd = normalized.lastIndexOf('\n', end);
      const sentenceEnd = normalized.lastIndexOf('. ', end);
      const spaceEnd = normalized.lastIndexOf(' ', end);
      const boundary = Math.max(paragraphEnd, sentenceEnd, spaceEnd);
      if (boundary > start + Math.floor(maxCharacters * 0.6)) {
        end = boundary + (boundary === sentenceEnd ? 1 : 0);
      }
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

export function tokenize(text: string) {
  return (
    text
      .toLowerCase()
      .match(/[a-z0-9]{2,}/g)
      ?.filter((token) => !stopWords.has(token)) ?? []
  );
}

const stopWords = new Set([
  'about',
  'after',
  'and',
  'are',
  'for',
  'from',
  'have',
  'into',
  'that',
  'the',
  'their',
  'there',
  'this',
  'with',
]);
