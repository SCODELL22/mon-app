import { getUserById, updatePassword } from '@/lib/users';
import {
  verifyResetTokenSignature,
  passwordFingerprint,
  hashPassword,
  signSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  redirectTo,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const form = await req.formData();
  const token = String(form.get('token') ?? '');
  const password = String(form.get('password') ?? '');
  const confirm = String(form.get('confirm') ?? '');

  const t = encodeURIComponent(token);

  const sig = await verifyResetTokenSignature(token);
  if (!sig) {
    return redirectTo('/forgot-password?error=expired');
  }
  const user = await getUserById(sig.uid);
  if (!user) {
    return redirectTo('/forgot-password?error=expired');
  }
  // Le lien est lié à l'empreinte du mot de passe au moment de son émission : si le mot de passe
  // a déjà été changé depuis (via ce même lien réutilisé, ou par un autre moyen), l'empreinte ne
  // correspond plus -> lien à usage unique sans avoir à le stocker côté serveur.
  const currentFp = await passwordFingerprint(user.passwordHash);
  if (currentFp !== sig.pf) {
    return redirectTo('/forgot-password?error=expired');
  }

  if (password.length < 8) {
    return redirectTo(`/reset-password?token=${t}&error=password`);
  }
  if (password !== confirm) {
    return redirectTo(`/reset-password?token=${t}&error=mismatch`);
  }

  const newHash = await hashPassword(password);
  await updatePassword(user.id, newHash);

  // Connecte directement l'utilisateur après la réinitialisation (meilleure UX).
  const sessionToken = await signSession({ uid: user.id, email: user.email });
  const res = redirectTo('/');
  res.cookies.set(SESSION_COOKIE, sessionToken, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
