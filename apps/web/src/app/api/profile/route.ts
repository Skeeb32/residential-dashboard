import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db';
import { UserModel } from '@/lib/models/user';
import { clearSessionCookie, getSessionUserId } from '@/lib/session';
import {
  deleteLocalDemoUser,
  findLocalDemoUserById,
  updateLocalDemoUser,
} from '@/lib/local-demo-store';

export const runtime = 'nodejs';

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json(
      { message: 'Sign in to continue.' },
      { status: 401 },
    );
  }

  try {
    const database = await connectToDatabase();
    const user = database
      ? await UserModel.findById(userId).select(
          'displayName username email createdAt',
        )
      : findLocalDemoUserById(userId);
    if (!user) {
      return NextResponse.json(
        { message: 'Account not found.' },
        { status: 401 },
      );
    }

    return NextResponse.json({
      temporaryStorage: !database,
      user: {
        id: '_id' in user ? user._id.toString() : user.id,
        displayName: user.displayName,
        username: user.username,
        email: user.email,
        createdAt:
          user.createdAt instanceof Date
            ? user.createdAt.toISOString()
            : user.createdAt,
      },
    });
  } catch {
    return NextResponse.json(
      {
        message:
          'Account service is unavailable. Check the database and retry.',
      },
      { status: 503 },
    );
  }
}

export async function PUT(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json(
      { message: 'Sign in to continue.' },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const displayName =
    typeof body?.displayName === 'string' ? body.displayName.trim() : '';
  const email =
    typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (
    displayName.length < 2 ||
    displayName.length > 80 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return NextResponse.json(
      { message: 'Enter a name and a valid email address.' },
      { status: 400 },
    );
  }

  try {
    const database = await connectToDatabase();
    const localUpdate = database
      ? null
      : updateLocalDemoUser(userId, { displayName, email });

    if (localUpdate?.emailInUse) {
      return NextResponse.json(
        { message: 'That email address is already in use.' },
        { status: 409 },
      );
    }

    const user = database
      ? await UserModel.findByIdAndUpdate(
          userId,
          { $set: { displayName, email } },
          { new: true, runValidators: true },
        ).select('displayName username email createdAt')
      : (localUpdate?.user ?? null);

    if (!user) {
      return NextResponse.json(
        { message: 'Account not found.' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      temporaryStorage: !database,
      user: {
        id: '_id' in user ? user._id.toString() : user.id,
        displayName: user.displayName,
        username: user.username,
        email: user.email,
        createdAt:
          user.createdAt instanceof Date
            ? user.createdAt.toISOString()
            : user.createdAt,
      },
    });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    ) {
      return NextResponse.json(
        { message: 'That email address is already in use.' },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { message: 'Your profile could not be saved. Please retry.' },
      { status: 503 },
    );
  }
}

export async function DELETE() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json(
      { message: 'Sign in to continue.' },
      { status: 401 },
    );
  }

  try {
    const database = await connectToDatabase();
    if (database) {
      if (!Types.ObjectId.isValid(userId)) {
        return NextResponse.json(
          { message: 'Account not found.' },
          { status: 404 },
        );
      }

      const account = await UserModel.findById(userId).select('_id');
      if (!account) {
        return NextResponse.json(
          { message: 'Account not found.' },
          { status: 404 },
        );
      }

      await database.connection
        .collection('properties')
        .deleteMany({ ownerId: new Types.ObjectId(userId) });
      await UserModel.deleteOne({ _id: userId });
    } else if (!deleteLocalDemoUser(userId)) {
      return NextResponse.json(
        { message: 'Account not found.' },
        { status: 404 },
      );
    }

    const response = NextResponse.json({ deleted: true });
    clearSessionCookie(response);
    return response;
  } catch {
    return NextResponse.json(
      { message: 'Your account could not be deleted. Please retry.' },
      { status: 503 },
    );
  }
}
