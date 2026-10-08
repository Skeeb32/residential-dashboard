import { hash } from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { UserModel } from '@/lib/models/user';
import { createSessionToken, setSessionCookie } from '@/lib/session';
import {
  createLocalDemoUser,
  seedLocalDemoProperties,
} from '@/lib/local-demo-store';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const displayName =
    typeof body?.displayName === 'string' ? body.displayName.trim() : '';
  const username =
    typeof body?.username === 'string'
      ? body.username.trim().toLowerCase()
      : '';
  const email =
    typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (
    displayName.length < 2 ||
    displayName.length > 80 ||
    !/^[a-z0-9._-]{3,32}$/.test(username) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length < 10 ||
    password.length > 128
  ) {
    return NextResponse.json(
      {
        message:
          'Check your details. Passwords must be at least 10 characters.',
      },
      { status: 400 },
    );
  }

  try {
    const database = await connectToDatabase();
    const passwordHash = await hash(password, 12);
    const user = database
      ? await UserModel.create({
          displayName,
          username,
          email,
          passwordHash,
        })
      : createLocalDemoUser({
          displayName,
          username,
          email,
          passwordHash,
        });

    if (!user) {
      return NextResponse.json(
        { message: 'That username or email is already registered.' },
        { status: 409 },
      );
    }

    const userId = '_id' in user ? user._id.toString() : user.id;
    if (
      !database &&
      username === 'mogultest' &&
      email === 'mogualtest@mogul.com' &&
      displayName === 'Mogul Test'
    ) {
      seedLocalDemoProperties(userId);
    }

    const token = await createSessionToken(userId);
    const response = NextResponse.json(
      {
        temporaryStorage: !database,
        user: {
          id: userId,
          displayName: user.displayName,
          username: user.username,
          email: user.email,
        },
      },
      { status: 201 },
    );
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    ) {
      return NextResponse.json(
        { message: 'That username or email is already registered.' },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        message:
          'Account service is unavailable. Check the database and retry.',
      },
      { status: 503 },
    );
  }
}
