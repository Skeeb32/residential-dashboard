import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface User {
    username: string;
    role: string;
  }

  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    role?: string;
  }
}
