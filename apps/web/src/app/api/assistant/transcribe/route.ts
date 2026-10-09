import { toFile } from 'openai/uploads';
import { NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/session';
import { getOpenAIClient } from '@/lib/assistant/openai';
import { checkAssistantRateLimit } from '@/lib/assistant/rate-limit';
import { writeAssistantAudit } from '@/lib/assistant/store';

export const runtime = 'nodejs';

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const audioTypes = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
]);

export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json(
      { message: 'Sign in to use voice input.' },
      { status: 401 },
    );
  }

  const limit = checkAssistantRateLimit(userId, 'assistant-transcribe', 10);
  if (!limit.allowed) {
    return NextResponse.json(
      { message: 'Voice request limit reached. Please retry shortly.' },
      {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfterSeconds) },
      },
    );
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json(
      { message: 'Voice transcription is not configured.' },
      { status: 503 },
    );
  }

  const formData = await request.formData().catch(() => null);
  const audio = formData?.get('audio');
  if (
    !(audio instanceof File) ||
    audio.size === 0 ||
    audio.size > MAX_AUDIO_BYTES
  ) {
    return NextResponse.json(
      { message: 'Choose an audio recording smaller than 20 MB.' },
      { status: 413 },
    );
  }
  if (audio.type && !audioTypes.has(audio.type)) {
    return NextResponse.json(
      { message: 'Use a WebM, OGG, MP4, MP3, or WAV recording.' },
      { status: 415 },
    );
  }

  try {
    const file = await toFile(
      Buffer.from(await audio.arrayBuffer()),
      audio.name || 'mogul-voice.webm',
      { type: audio.type || 'audio/webm' },
    );
    const result = await getOpenAIClient().audio.transcriptions.create({
      file,
      model: process.env.OPENAI_TRANSCRIPTION_MODEL ?? 'gpt-4o-mini-transcribe',
    });
    await writeAssistantAudit({
      userId,
      action: 'assistant.voice_transcription',
      outcome: 'success',
    });
    return NextResponse.json({ text: result.text });
  } catch {
    await writeAssistantAudit({
      userId,
      action: 'assistant.voice_transcription',
      outcome: 'error',
    }).catch(() => undefined);
    return NextResponse.json(
      { message: 'Speech could not be transcribed. Please retry.' },
      { status: 502 },
    );
  }
}
