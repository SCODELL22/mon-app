// Sauvegarde complète du module au format JSON.
//
// Ces données sont la source de vérité : contrairement aux opportunités, rien ne permet de les
// reconstituer depuis BoondManager. Cet export est le filet de sécurité — à télécharger
// régulièrement, et à conserver hors de l'application.
//
// Il contient la ZONE PRIVÉE de TOUS les entretiens : réservé aux administrateurs
// (MANAGER_EMAILS). Un manager d'équipe n'y a pas accès — l'export ignore les périmètres.
import { acces, peutAdministrer, refus } from '@/lib/access';
import { exportTout } from '@/lib/one-on-one-store';
import { aujourdHui } from '@/lib/one-on-one';
import { espaceDeRequete } from '@/lib/espace';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // Espace direction : administrateurs = DG_EMAILS uniquement (cf. lib/access.ts).
  const espace = espaceDeRequete(req);
  const a = await acces(espace);
  if (a.role === 'AUCUN') return refus('unauthorized');
  if (!peutAdministrer(a)) return refus('forbidden');

  const data = await exportTout(espace);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${espace === 'direction' ? 'oto-da' : 'suivi-1-1'}-${aujourdHui()}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
