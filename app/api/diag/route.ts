// Diagnostic de configuration des accès — réservé aux administrateurs de l'agence
// (MANAGER_EMAILS). Montre ce que le SERVEUR lit réellement dans les variables d'environnement,
// pour trancher les « je l'ai pourtant mis dans Railway ».
//
//   GET /api/diag                     -> état des listes
//   GET /api/diag?email=prenom.nom@…  -> ce que cette adresse peut faire
import { acces, estEmailAdmin, estEmailDg, refus } from '@/lib/access';
import { isAllowedEmail, listeEmails, normaliserEmail } from '@/lib/auth';
import { getUserByEmail } from '@/lib/users';

export const dynamic = 'force-dynamic';

function analyse(nom: string) {
  const brut = process.env[nom];
  if (brut === undefined) return { variable: nom, definie: false };
  return {
    variable: nom,
    definie: true,
    longueur: brut.length,
    adressesLues: listeEmails(brut),
    // Indices de format : utiles pour comprendre une valeur mal collée. Le code actuel les tolère.
    contientPointVirgule: brut.includes(';'),
    contientRetourLigne: /[\r\n]/.test(brut),
    contientGuillemets: /["']/.test(brut),
    contientCaracteresInvisibles: /[ ​-‍⁠﻿]/.test(brut),
  };
}

export async function GET(req: Request) {
  const a = await acces('agence');
  if (!a.estAdmin) return refus('forbidden');

  const cible = new URL(req.url).searchParams.get('email');
  const test = cible
    ? {
        emailNormalise: normaliserEmail(cible),
        peutCreerUnCompte: isAllowedEmail(cible),
        compteDejaCree: !!(await getUserByEmail(normaliserEmail(cible))),
        estAdminAgence: estEmailAdmin(cible),
        estDg: estEmailDg(cible),
      }
    : null;

  return Response.json(
    {
      versionDeployee: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? 'inconnue',
      ALLOWED_EMAILS: analyse('ALLOWED_EMAILS'),
      ALLOWED_EMAIL_DOMAIN: process.env.ALLOWED_EMAIL_DOMAIN ?? '(défaut : ippon.fr)',
      MANAGER_EMAILS: analyse('MANAGER_EMAILS'),
      DG_EMAILS: analyse('DG_EMAILS'),
      test,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
