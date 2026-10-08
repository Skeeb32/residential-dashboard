import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { UserModel } from '@/lib/models/user';
import { getSessionUserId } from '@/lib/session';

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
    await connectToDatabase();
    const user = await UserModel.findById(userId).select(
      'displayName username email createdAt',
    );
    if (!user) {
      return NextResponse.json(
        { message: 'Account not found.' },
        { status: 401 },
      );
    }

    return NextResponse.json({
      user: {
        id: user._id.toString(),
        displayName: user.displayName,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
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
    await connectToDatabase();
    const user = await UserModel.findByIdAndUpdate(
      userId,
      { $set: { displayName, email } },
      { new: true, runValidators: true },
    ).select('displayName username email createdAt');

    if (!user) {
      return NextResponse.json(
        { message: 'Account not found.' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      user: {
        id: user._id.toString(),
        displayName: user.displayName,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
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
