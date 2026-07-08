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
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

function redirectWithCookie(url: URL, cookie: string): Response {
  const res = Response.redirect(url, 303);
  res.headers.append('Set-Cookie', cookie);
  return res;
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (isRateLimited(`signup:${ip}`)) {
    return Response.redirect(new URL('/signup?error=ratelimited', req.url), 303);
  }

  const form = await req.formData();
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const confirm = String(form.get('confirm') ?? '');

  if (!isValidEmail(email)) {
    return Response.redirect(new URL('/signup?error=email', req.url), 303);
  }
  if (password.length < 8) {
    return Response.redirect(new URL('/signup?error=password', req.url), 303);
  }
  if (password !== confirm) {
    return Response.redirect(new URL('/signup?error=mismatch', req.url), 303);
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    recordFailedAttempt(`signup:${ip}`);
    return Response.redirect(new URL('/signup?error=taken', req.url), 303);
  }

  const passwordHash = await hashPassword(password);
  const user = await createUser(email, passwordHash);
  const token = await signSession({ uid: user.id, email: user.email });
  const cookie = `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${
    process.env.NODE_ENV === 'production' ? '; Secure' : ''
  }`;
  return redirectWithCookie(new URL('/', req.url), cookie);
}
