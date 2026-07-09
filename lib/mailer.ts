// Envoi d'email transactionnel via l'API HTTP de Resend (https://resend.com). Aucune dépendance
// npm ajoutée : un simple fetch, cohérent avec le reste de l'auth (lib/auth.ts, lib/users.ts).

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY manquant (variable d'environnement à définir).");
  const from = process.env.RESEND_FROM || 'Pilotage Ippon <onboarding@resend.dev>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Échec envoi email (Resend ${res.status}) : ${text}`);
  }
}

/** Envoie l'email de réinitialisation de mot de passe avec le lien signé (valable 30 min). */
export async function sendResetEmail(to: string, link: string): Promise<void> {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px 0;">
      <p style="font-family:Arial,sans-serif;font-size:20px;font-weight:700;color:#003CDC;margin:0 0 24px;text-transform:lowercase;">ippon</p>
      <h2 style="color:#000F41;font-size:20px;margin:0 0 12px;">Réinitialisation de mot de passe</h2>
      <p style="color:#333;font-size:14px;line-height:1.5;">Tu as demandé à réinitialiser ton mot de passe pour le pilotage commercial.</p>
      <p style="margin:24px 0;">
        <a href="${link}" style="display:inline-block;background:#003CDC;color:#fff;padding:11px 20px;border-radius:2px;text-decoration:none;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.03em;">
          Choisir un nouveau mot de passe
        </a>
      </p>
      <p style="color:#6E6E6E;font-size:12px;line-height:1.5;">
        Ce lien expire dans 30 minutes et ne peut être utilisé qu'une seule fois.
        Si tu n'es pas à l'origine de cette demande, ignore cet email — ton mot de passe reste inchangé.
      </p>
    </div>`;
  await sendEmail(to, 'Réinitialisation de ton mot de passe — Pilotage Ippon', html);
}
