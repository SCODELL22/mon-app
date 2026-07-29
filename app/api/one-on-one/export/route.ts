// Sauvegarde complète du module au format JSON.
//
// Ces données sont la source de vérité : contrairement aux opportunités, rien ne permet de les
// reconstituer depuis BoondManager. Cet export est le filet de sécurité — à télécharger
// régulièrement, et à conserver hors de l'application.
//
// Il contient la ZONE PRIVÉE MANAGER : réservé aux managers, jamais de fallback silencieux.
import { acces, peutEcrire, refus } from '@/lib/access';
import { exportTout } from '@/lib/one-on-one-store';
import { aujourdHui } from '@/lib/one-on-one';

export const dynamic = 'force-dynamic';

export async function GET() {
  const a = await acces();
  if (a.role === 'AUCUN') return refus('unauthorized');
  if (!peutEcrire(a)) return refus('forbidden');

  const data = await exportTout();
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="suivi-1-1-${aujourdHui()}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
