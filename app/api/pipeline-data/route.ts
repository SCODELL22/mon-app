import { getRawCsv } from '@/lib/store';
import { acces, refus } from '@/lib/access';
import { espaceDeRequete } from '@/lib/espace';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const espace = espaceDeRequete(req);
  // L'import France est réservé au DG. L'import agence reste lisible par tout compte connecté
  // (comportement historique : proxy.ts vérifie la connexion).
  if (espace === 'direction' && !(await acces('direction')).estAdmin) return refus('forbidden');

  const csv = await getRawCsv(espace);
  if (!csv) {
    // Corps null obligatoire : le runtime refuse un corps (même vide) sur un 204 et lève une
    // TypeError, ce qui transformait « aucune donnée » en erreur 500.
    return new Response(null, { status: 204 });
  }
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
