import { NextResponse } from 'next/server';
import { createUser, getUserByEmail } from '@/lib/users';
import {
  hashPassword,
  signSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  isRateLimited,
  recordFailedAttempt,
  clientIp,
  isValidEmail,
  isAllowedEmailDomain,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (isRateLimited(`signup:${ip}`)) {
    return NextResponse.redirect(new URL('/signup?error=ratelimited', req.url), 303);
  }

  const form = await req.formData();
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const confirm = String(form.get('confirm') ?? '');

  if (!isValidEmail(email)) {
    return NextResponse.redirect(new URL('/signup?error=email', req.url), 303);
  }
  if (!isAllowedEmailDomain(email)) {
    recordFailedAttempt(`signup:${ip}`);
    return NextResponse.redirect(new URL('/signup?error=domain', req.url), 303);
  }
  if (password.length < 8) {
    return NextResponse.redirect(new URL('/signup?error=password', req.url), 303);
  }
  if (password !== confirm) {
    return NextResponse.redirect(new URL('/signup?error=mismatch', req.url), 303);
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    recordFailedAttempt(`signup:${ip}`);
    return NextResponse.redirect(new URL('/signup?error=taken', req.url), 303);
  }

  const passwordHash = await hashPassword(password);
  const user = await createUser(email, passwordHash);
  const token = await signSession({ uid: user.id, email: user.email });

  // NextResponse.redirect() (et non Response.redirect() natif) : la spec Fetch rend les headers
  // d'un Response.redirect() immuables, ce qui empêche d'y ajouter le cookie de session ensuite.
  const res = NextResponse.redirect(new URL('/', req.url), 303);
  res.cookies.set(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
