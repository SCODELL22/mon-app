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
  isAllowedEmail,
  redirectTo,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (isRateLimited(`signup:${ip}`)) {
    return redirectTo('/signup?error=ratelimited');
  }

  const form = await req.formData();
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const confirm = String(form.get('confirm') ?? '');

  if (!isValidEmail(email)) {
    return redirectTo('/signup?error=email');
  }
  if (!isAllowedEmail(email)) {
    recordFailedAttempt(`signup:${ip}`);
    return redirectTo('/signup?error=domain');
  }
  if (password.length < 8) {
    return redirectTo('/signup?error=password');
  }
  if (password !== confirm) {
    return redirectTo('/signup?error=mismatch');
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    recordFailedAttempt(`signup:${ip}`);
    return redirectTo('/signup?error=taken');
  }

  const passwordHash = await hashPassword(password);
  const user = await createUser(email, passwordHash);
  const token = await signSession({ uid: user.id, email: user.email });

  // redirectTo() (Location relatif) plutôt qu'une URL absolue construite depuis req.url : derrière
  // certains hébergeurs (Railway inclus), req.url peut résoudre sur l'adresse interne du conteneur
  // (localhost:8080) au lieu du domaine public, ce qui envoie le navigateur vers sa propre machine.
  const res = redirectTo('/');
  res.cookies.set(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
