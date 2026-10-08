import { compare } from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { UserModel } from '@/lib/models/user';
import { createSessionToken, setSessionCookie } from '@/lib/session';
import { findLocalDemoUserByUsername } from '@/lib/local-demo-store';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const username =
    typeof body?.username === 'string'
      ? body.username.trim().toLowerCase()
      : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!username || !password) {
    return NextResponse.json(
      { message: 'Enter your username and password.' },
      { status: 400 },
    );
  }

  try {
    const database = await connectToDatabase();
    const user = database
      ? await UserModel.findOne({ username }).select('+passwordHash')
      : findLocalDemoUserByUsername(username);
    const passwordMatches = user
      ? await compare(password, user.passwordHash)
      : false;

    if (!user || !passwordMatches) {
      return NextResponse.json(
        { message: 'The username or password is incorrect.' },
        { status: 401 },
      );
    }

    const userId = '_id' in user ? user._id.toString() : user.id;
    const token = await createSessionToken(userId);
    const response = NextResponse.json({
      temporaryStorage: !database,
      user: {
        id: userId,
        displayName: user.displayName,
        username: user.username,
        email: user.email,
      },
    });
    setSessionCookie(response, token);
    return response;
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
