// Mise à jour rapide d'une action depuis la vue transverse (clôturer, reporter l'échéance).
import { acces, peutEcrire, refus } from '@/lib/access';
import { redirectTo } from '@/lib/auth';
import { getAction, upsertAction } from '@/lib/one-on-one-store';
import type { ActionStatut } from '@/lib/one-on-one';

export const dynamic = 'force-dynamic';

const STATUTS_VALIDES: ActionStatut[] = ['OUVERTE', 'EN_COURS', 'FAITE', 'ABANDONNEE'];

export async function POST(req: Request) {
  const a = await acces();
  if (a.role === 'AUCUN') return refus('unauthorized');
  if (!peutEcrire(a)) return refus('forbidden');

  const form = await req.formData();
  const id = String(form.get('id') ?? '').trim();
  const retour = String(form.get('retour') ?? '/1-1/actions');

  const action = await getAction(id);
  if (!action) return redirectTo(retour.startsWith('/') ? retour : '/1-1/actions');

  const statutBrut = String(form.get('statut') ?? '');
  const echeanceBrute = String(form.get('echeance') ?? '').trim();

  await upsertAction({
    ...action,
    statut: STATUTS_VALIDES.includes(statutBrut as ActionStatut)
      ? (statutBrut as ActionStatut)
      : action.statut,
    echeance: /^\d{4}-\d{2}-\d{2}$/.test(echeanceBrute) ? echeanceBrute : action.echeance,
  });

  // Location relatif imposé (cf. commentaire de redirectTo dans lib/auth.ts).
  return redirectTo(retour.startsWith('/') ? retour : '/1-1/actions');
}
