// Création / mise à jour d'un entretien 1:1, et des actions décidées pendant la séance.
// Formulaire HTML natif (même approche que /api/auth/login) : pas de JS client, compatible
// avec la CSP stricte définie dans next.config.ts.
//
// La lecture du formulaire vit dans lib/one-on-one-formulaire.ts : elle est partagée avec
// /api/one-on-one/extraction, que le second bouton du même formulaire appelle via `formaction`.
import { acces, peutEcrire, refus } from '@/lib/access';
import { redirectTo } from '@/lib/auth';
import { getCommercial } from '@/lib/one-on-one-store';
import { enregistrerEntretien } from '@/lib/one-on-one-formulaire';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const a = await acces();
  if (a.role === 'AUCUN') return refus('unauthorized');
  if (!peutEcrire(a)) return refus('forbidden');

  const form = await req.formData();

  const commercial = await getCommercial(String(form.get('commercialId') ?? '').trim());
  if (!commercial) return redirectTo('/1-1?error=commercial-inconnu');

  const entretien = await enregistrerEntretien(form, a.email);

  return redirectTo(`/1-1/entretien/${entretien.id}`);
}
