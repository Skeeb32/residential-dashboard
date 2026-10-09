import { NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/session';
import { listAssistantConversations } from '@/lib/assistant/store';

export const runtime = 'nodejs';

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json(
      { message: 'Sign in to view conversations.' },
      { status: 401 },
    );
  }

  try {
    return NextResponse.json({
      conversations: await listAssistantConversations(userId),
    });
  } catch {
    return NextResponse.json(
      { message: 'Conversation history is unavailable.' },
      { status: 503 },
    );
  }
}
