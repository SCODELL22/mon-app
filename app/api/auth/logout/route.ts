import { SESSION_COOKIE, redirectTo } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const res = redirectTo('/login');
  res.cookies.set(SESSION_COOKIE, '', { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 0 });
  return res;
}
