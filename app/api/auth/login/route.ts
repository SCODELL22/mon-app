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
  redirectTo,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rateKey = `login:${ip}`;
  if (isRateLimited(rateKey)) {
    return redirectTo('/login?error=ratelimited');
  }

  const form = await req.formData();
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const next = String(form.get('next') ?? '') || '/';

  const user = await getUserByEmail(email);
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !valid) {
    recordFailedAttempt(rateKey);
    return redirectTo('/login?error=invalid');
  }

  clearRateLimit(rateKey);
  const token = await signSession({ uid: user.id, email: user.email });

  // redirectTo() (Location relatif) plutôt qu'une URL absolue construite depuis req.url : derrière
  // certains hébergeurs (Railway inclus), req.url peut résoudre sur l'adresse interne du conteneur
  // (localhost:8080) au lieu du domaine public, ce qui envoie le navigateur vers sa propre machine.
  const res = redirectTo(next.startsWith('/') ? next : '/');
  res.cookies.set(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
