import { parse as parseCsv } from 'csv-parse/sync';
import { load as loadHtml } from 'cheerio';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db';
import { getSessionUserId } from '@/lib/session';
import { getLocalDemoProperties } from '@/lib/local-demo-store';
import { getOpenAIClient, hasOpenAIKey } from '@/lib/assistant/openai';
import {
  getUserAssistantDocuments,
  storeAssistantDocument,
  writeAssistantAudit,
} from '@/lib/assistant/store';
import { checksumText, chunkText, redactSensitiveText } from '@/lib/rag/text';

export const runtime = 'nodejs';

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = new Set([
  'pdf',
  'docx',
  'html',
  'htm',
  'csv',
  'txt',
  'md',
  'json',
]);

function safeFileName(fileName: string) {
  return fileName.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 180);
}

async function extractText(fileName: string, buffer: Buffer) {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (!ACCEPTED_EXTENSIONS.has(extension)) {
    throw new Error(
      'Unsupported file type. Upload PDF, DOCX, HTML, CSV, TXT, Markdown, or JSON.',
    );
  }

  if (extension === 'pdf') {
    const result = await pdfParse(buffer);
    return { text: result.text, pageCount: result.numpages };
  }

  if (extension === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value, pageCount: undefined };
  }

  const rawText = buffer.toString('utf8');
  if (extension === 'html' || extension === 'htm') {
    const page = loadHtml(rawText);
    page('script, style, noscript, iframe, object').remove();
    return { text: page('body').text(), pageCount: undefined };
  }

  if (extension === 'csv') {
    const rows = parseCsv(rawText, { bom: true, skip_empty_lines: true });
    return {
      text: (rows as string[][])
        .map((row) => row.map((cell) => String(cell).trim()).join(' | '))
        .join('\n'),
      pageCount: undefined,
    };
  }

  return { text: rawText, pageCount: undefined };
}

async function embedChunks(chunks: string[]) {
  if (!hasOpenAIKey()) return chunks.map(() => undefined);

  const embeddings: Array<number[] | undefined> = chunks.map(() => undefined);
  const client = getOpenAIClient();
  for (let offset = 0; offset < chunks.length; offset += 64) {
    const batch = chunks.slice(offset, offset + 64);
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
    });
    for (const item of response.data) {
      embeddings[offset + item.index] = item.embedding;
    }
  }
  return embeddings;
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json(
      { message: 'Sign in to view documents.' },
      { status: 401 },
    );
  }

  try {
    const documents = await getUserAssistantDocuments(userId);
    return NextResponse.json({ documents });
  } catch {
    return NextResponse.json(
      { message: 'Documents are unavailable. Please retry.' },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json(
      { message: 'Sign in to upload documents.' },
      { status: 401 },
    );
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { message: 'Choose a document to upload.' },
      { status: 400 },
    );
  }
  if (file.size === 0 || file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { message: 'Documents must be between 1 byte and 15 MB.' },
      { status: 413 },
    );
  }

  const propertyIdValue = formData?.get('propertyId');
  const propertyId =
    typeof propertyIdValue === 'string' ? propertyIdValue.trim() : '';
  const urlValue = formData?.get('url');
  const url =
    typeof urlValue === 'string' ? urlValue.trim().slice(0, 1000) : '';
  const fileName = safeFileName(file.name || 'uploaded-document');

  try {
    if (propertyId) {
      const database = await connectToDatabase();
      const ownsProperty = database
        ? Types.ObjectId.isValid(propertyId) &&
          Boolean(
            await database.connection
              .collection('properties')
              .findOne(
                {
                  _id: new Types.ObjectId(propertyId),
                  ownerId: new Types.ObjectId(userId),
                },
                { projection: { _id: 1 } },
              ),
          )
        : getLocalDemoProperties(userId).some(
            (property) => property.id === propertyId,
          );
      if (!ownsProperty) {
        return NextResponse.json(
          { message: 'The selected property is not in your account.' },
          { status: 404 },
        );
      }
    }

    const extracted = await extractText(
      fileName,
      Buffer.from(await file.arrayBuffer()),
    );
    const redactedText = redactSensitiveText(extracted.text).trim();
    if (redactedText.length < 20) {
      return NextResponse.json(
        { message: 'No usable text was found in that file.' },
        { status: 400 },
      );
    }

    const chunks = chunkText(redactedText);
    const embeddings = await embedChunks(chunks);
    const checksum = checksumText(redactedText);
    const sourceType = fileName.split('.').pop()?.toLowerCase() ?? 'text';
    const result = await storeAssistantDocument(
      {
        userId,
        title: fileName,
        sourceType: sourceType as 'pdf' | 'docx' | 'html' | 'csv' | 'text',
        url: url || undefined,
        propertyId: propertyId || undefined,
        checksum,
      },
      chunks.map((text, index) => ({
        accountId: userId,
        propertyId: propertyId || undefined,
        sourceType: sourceType as 'pdf' | 'docx' | 'html' | 'csv' | 'text',
        title: fileName,
        url: url || undefined,
        page:
          extracted.pageCount && chunks.length > 1
            ? Math.min(
                extracted.pageCount,
                Math.floor((index * extracted.pageCount) / chunks.length) + 1,
              )
            : undefined,
        text,
        embedding: embeddings[index],
      })),
    );

    if (result.duplicate) {
      return NextResponse.json(
        { message: 'This document is already indexed.' },
        { status: 409 },
      );
    }

    await writeAssistantAudit({
      userId,
      action: 'document.upload',
      resourceId: result.document?.id,
      outcome: 'success',
    });

    return NextResponse.json(
      {
        document: result.document,
        chunkCount: chunks.length,
        embeddingsCreated: embeddings.filter(Boolean).length,
        piiRedacted: true,
        temporaryStorage: !(await connectToDatabase()),
      },
      { status: 201 },
    );
  } catch (error) {
    await writeAssistantAudit({
      userId,
      action: 'document.upload',
      outcome: 'error',
    }).catch(() => undefined);
    const message =
      error instanceof Error ? error.message : 'Document upload failed.';
    return NextResponse.json(
      { message },
      { status: message.startsWith('Unsupported file type') ? 415 : 500 },
    );
  }
}
