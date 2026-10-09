import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';

export async function getSessionUserId() {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}
