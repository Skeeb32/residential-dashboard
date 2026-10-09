import { compare } from 'bcryptjs';
import CredentialsProvider from 'next-auth/providers/credentials';
import type { NextAuthOptions } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { UserModel } from '@/lib/models/user';
import { findLocalDemoUserByUsername } from '@/lib/local-demo-store';

const developmentSecret =
  'mogul-auth-development-secret-change-before-deployment';

export const authOptions: NextAuthOptions = {
  secret:
    process.env.NEXTAUTH_SECRET ??
    process.env.SESSION_SECRET ??
    (process.env.NODE_ENV === 'production' ? undefined : developmentSecret),
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: '/' },
  providers: [
    CredentialsProvider({
      name: 'Mogul',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const username = credentials?.username?.trim().toLowerCase();
        const password = credentials?.password;
        if (!username || !password) return null;

        const database = await connectToDatabase();
        const user = database
          ? await UserModel.findOne({ username }).select('+passwordHash')
          : findLocalDemoUserByUsername(username);
        if (!user || !(await compare(password, user.passwordHash))) return null;

        return {
          id: '_id' in user ? user._id.toString() : user.id,
          name: user.displayName,
          email: user.email,
          username: user.username,
          role: 'user',
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId ?? token.sub ?? '';
        session.user.role = token.role ?? 'user';
      }
      return session;
    },
  },
};
