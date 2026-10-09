import { NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/session';
import {
  deleteUserAssistantDocument,
  writeAssistantAudit,
} from '@/lib/assistant/store';

export const runtime = 'nodejs';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json(
      { message: 'Sign in to delete documents.' },
      { status: 401 },
    );
  }

  const { documentId } = await context.params;
  try {
    const deleted = await deleteUserAssistantDocument(userId, documentId);
    if (!deleted) {
      return NextResponse.json(
        { message: 'Document not found.' },
        { status: 404 },
      );
    }

    await writeAssistantAudit({
      userId,
      action: 'document.delete',
      resourceId: documentId,
      outcome: 'success',
    });
    return NextResponse.json({ deleted: true });
  } catch {
    await writeAssistantAudit({
      userId,
      action: 'document.delete',
      resourceId: documentId,
      outcome: 'error',
    }).catch(() => undefined);
    return NextResponse.json(
      { message: 'Document could not be deleted.' },
      { status: 503 },
    );
  }
}
