// Partage d'un entretien avec le commercial concerné, et retrait du partage.
//
// Route SÉPARÉE de l'enregistrement du formulaire, volontairement : partager un compte rendu est
// un geste délibéré du manager, il ne doit jamais être l'effet de bord d'une sauvegarde. Tant que
// cette route n'a pas été appelée, le commercial ne voit rien de l'entretien.
import { acces, gere, peutEcrire, refus } from '@/lib/access';
import { redirectTo } from '@/lib/auth';
import { definirPartage, getOneOnOne } from '@/lib/one-on-one-store';
import { estModeFrance } from '@/lib/perimetre';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const a = await acces();
  if (a.role === 'AUCUN') return refus('unauthorized');
  if (!peutEcrire(a)) return refus('forbidden');
  // Périmètre France : les OTO ne se partagent pas (aucun directeur d'agence n'a d'accès).
  if (estModeFrance()) return refus('forbidden');

  const form = await req.formData();
  const id = String(form.get('id') ?? '').trim();
  // Le formulaire envoie explicitement l'action voulue plutôt qu'une bascule : deux soumissions
  // successives (double-clic, retour arrière) donnent alors le même résultat.
  const partager = String(form.get('partager') ?? '') === '1';

  const entretien = await getOneOnOne(id);
  if (!entretien) return redirectTo('/1-1?error=entretien-inconnu');
  if (!gere(a, entretien.commercialId)) return refus('forbidden');

  await definirPartage(id, partager);

  return redirectTo(`/1-1/entretien/${id}?${partager ? 'partage=1' : 'retire=1'}`);
}
