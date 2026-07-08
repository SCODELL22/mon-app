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
    return Response.redirect(new URL('/login?error=ratelimited', req.url), 303);
  }

  const form = await req.formData();
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const next = String(form.get('next') ?? '') || '/';

  const user = await getUserByEmail(email);
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !valid) {
    recordFailedAttempt(rateKey);
    return Response.redirect(new URL('/login?error=invalid', req.url), 303);
  }

  clearRateLimit(rateKey);
  const token = await signSession({ uid: user.id, email: user.email });
  const res = Response.redirect(new URL(next.startsWith('/') ? next : '/', req.url), 303);
  res.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${
      process.env.NODE_ENV === 'production' ? '; Secure' : ''
    }`,
  );
  return res;
}
