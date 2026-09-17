// Création / mise à jour d'un entretien 1:1, et des actions décidées pendant la séance.
// Formulaire HTML natif (même approche que /api/auth/login) : pas de JS client, compatible
// avec la CSP stricte définie dans next.config.ts.
//
// La lecture du formulaire vit dans lib/one-on-one-formulaire.ts : elle est partagée avec
// /api/one-on-one/extraction, que le second bouton du même formulaire appelle via `formaction`.
import { acces, peutEcrire, refus } from '@/lib/access';
import { horsPerimetre } from '@/lib/one-on-one-formulaire';
import { redirectTo } from '@/lib/auth';
import { getCommercial } from '@/lib/one-on-one-store';
import { enregistrerEntretien } from '@/lib/one-on-one-formulaire';
import { baseSuivi, espaceDeRequete } from '@/lib/espace';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const espace = espaceDeRequete(req);
  const base = baseSuivi(espace);
  const a = await acces(espace);
  if (a.role === 'AUCUN') return refus('unauthorized');
  if (!peutEcrire(a)) return refus('forbidden');

  const form = await req.formData();

  const commercial = await getCommercial(espace, String(form.get('commercialId') ?? '').trim());
  if (!commercial) return redirectTo(`${base}?error=commercial-inconnu`);
  // Périmètre : la fiche cible ET, en édition, la fiche d'origine de l'entretien. Sans ce second
  // contrôle, un manager pourrait réécrire l'entretien d'une autre équipe en forgeant son id.
  const denied = await horsPerimetre(a, commercial.id, String(form.get('id') ?? '').trim());
  if (denied) return denied;

  const entretien = await enregistrerEntretien(espace, form, a.email);

  return redirectTo(`${base}/entretien/${entretien.id}`);
}
