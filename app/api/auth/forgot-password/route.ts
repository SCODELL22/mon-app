import { getUserByEmail } from '@/lib/users';
import { signResetToken, isRateLimited, recordFailedAttempt, clientIp, redirectTo } from '@/lib/auth';
import { sendResetEmail } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (isRateLimited(`forgot:${ip}`)) {
    return redirectTo('/forgot-password?error=ratelimited');
  }
  // Compte chaque tentative (succès ou échec) : limite le débit d'envoi d'emails, pas seulement
  // les erreurs — sans ça, quelqu'un pourrait spammer la boîte mail d'un compte existant.
  recordFailedAttempt(`forgot:${ip}`);

  const form = await req.formData();
  const email = String(form.get('email') ?? '').trim().toLowerCase();

  const user = await getUserByEmail(email);
  if (user) {
    // APP_URL (domaine public, ex: https://ipponparis.com) plutôt que req.url : derrière Railway,
    // req.url peut résoudre sur l'adresse interne du conteneur (localhost:8080) — un lien construit
    // dessus serait inutilisable une fois cliqué depuis la messagerie de l'utilisateur.
    const base = process.env.APP_URL;
    if (!base) {
      console.error(
        "APP_URL manquant : impossible de construire un lien de réinitialisation utilisable. " +
          'Définir APP_URL (ex: https://ipponparis.com) dans les variables Railway.',
      );
    } else {
      const token = await signResetToken(user.id, user.passwordHash);
      const link = `${base.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
      try {
        await sendResetEmail(user.email, link);
      } catch (e) {
        console.error('Échec envoi email de réinitialisation', e);
      }
    }
  }

  // Toujours la même réponse, que le compte existe ou non : ne pas révéler quelles adresses
  // sont enregistrées (anti-énumération de comptes).
  return redirectTo('/forgot-password?sent=1');
}
