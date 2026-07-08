import { NextResponse } from 'next/server';
import { getUserByEmail } from '@/lib/users';
import {
  verifyPassword,
  signSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  isRateLimited,
  recordFailedAttempt,
  clearRateLimit,
  clientIp,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rateKey = `login:${ip}`;
  if (isRateLimited(rateKey)) {
    return NextResponse.redirect(new URL('/login?error=ratelimited', req.url), 303);
  }

  const form = await req.formData();
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const next = String(form.get('next') ?? '') || '/';

  const user = await getUserByEmail(email);
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !valid) {
    recordFailedAttempt(rateKey);
    return NextResponse.redirect(new URL('/login?error=invalid', req.url), 303);
  }

  clearRateLimit(rateKey);
  const token = await signSession({ uid: user.id, email: user.email });

  // NextResponse.redirect() (et non Response.redirect() natif) : la spec Fetch rend les headers
  // d'un Response.redirect() immuables, ce qui empêche d'y ajouter le cookie de session ensuite.
  const res = NextResponse.redirect(new URL(next.startsWith('/') ? next : '/', req.url), 303);
  res.cookies.set(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
