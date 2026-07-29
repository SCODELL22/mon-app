// Création / mise à jour de la fiche d'un commercial suivi.
//
// Le champ `email` a une portée de sécurité : il donne au titulaire du compte l'accès en lecture
// aux comptes rendus de ce commercial. Une faute de frappe ouvre les CR à la mauvaise personne.
// D'où la restriction au domaine autorisé et le refus d'un email déjà attribué.
import { acces, estEmailManager, peutEcrire, refus } from '@/lib/access';
import { isValidEmail, isAllowedEmailDomain, redirectTo } from '@/lib/auth';
import { getCommercialParEmail, listCommerciaux, upsertCommercial } from '@/lib/one-on-one-store';
import { nouvelId } from '@/lib/one-on-one';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const a = await acces();
  if (a.role === 'AUCUN') return refus('unauthorized');
  if (!peutEcrire(a)) return refus('forbidden');

  const form = await req.formData();
  const id = String(form.get('id') ?? '').trim();
  const nom = String(form.get('nom') ?? '').trim();
  const email = String(form.get('email') ?? '').trim().toLowerCase();

  if (!nom) return redirectTo('/1-1/commerciaux?error=nom');

  if (email) {
    if (!isValidEmail(email)) return redirectTo('/1-1/commerciaux?error=email');
    // Même règle que l'inscription : pas d'adresse externe rattachée à une fiche interne.
    if (!isAllowedEmailDomain(email)) return redirectTo('/1-1/commerciaux?error=domaine');
    // Rattacher un manager à une fiche commercial n'a pas de sens et brouille le calcul de rôle
    // (estEmailManager gagne dans acces(), la fiche serait ignorée).
    if (estEmailManager(email)) return redirectTo('/1-1/commerciaux?error=manager');
    const deja = await getCommercialParEmail(email);
    if (deja && deja.id !== id) return redirectTo('/1-1/commerciaux?error=email-pris');
  }

  const existants = await listCommerciaux(true);
  const existant = id ? existants.find((c) => c.id === id) : undefined;
  if (id && !existant) return redirectTo('/1-1/commerciaux?error=introuvable');

  await upsertCommercial({
    id: existant?.id ?? nouvelId('com'),
    nom,
    libelleBoond: String(form.get('libelleBoond') ?? '').trim(),
    email,
    pole: String(form.get('pole') ?? '').trim(),
    objectifAnnuel: Number(
      String(form.get('objectifAnnuel') ?? '0').replace(/\s/g, '').replace(',', '.'),
    ) || 0,
    actif: form.get('actif') !== null,
  });

  return redirectTo('/1-1/commerciaux?ok=1');
}
