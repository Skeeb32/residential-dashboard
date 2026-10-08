import { compare } from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { UserModel } from '@/lib/models/user';
import { createSessionToken, setSessionCookie } from '@/lib/session';

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
    await connectToDatabase();
    const user = await UserModel.findOne({ username }).select('+passwordHash');
    const passwordMatches = user
      ? await compare(password, user.passwordHash)
      : false;

    if (!user || !passwordMatches) {
      return NextResponse.json(
        { message: 'The username or password is incorrect.' },
        { status: 401 },
      );
    }

    const token = await createSessionToken(user._id.toString());
    const response = NextResponse.json({
      user: {
        id: user._id.toString(),
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
