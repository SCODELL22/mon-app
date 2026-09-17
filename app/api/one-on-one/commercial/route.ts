// Création / mise à jour de la fiche d'un commercial suivi.
//
// Le champ `email` a une portée de sécurité : il donne au titulaire du compte l'accès en lecture
// aux comptes rendus de ce commercial. Une faute de frappe ouvre les CR à la mauvaise personne.
// D'où la restriction au domaine autorisé et le refus d'un email déjà attribué.
//
// Le champ `managerEmail` a une portée encore plus large : il donne au titulaire l'accès COMPLET
// (zone privée comprise) aux entretiens de la fiche. Seul un administrateur peut le modifier —
// sinon n'importe quel manager pourrait s'attribuer n'importe quel commercial.
import { acces, estEmailAdmin, peutAdministrer, refus } from '@/lib/access';
import { isValidEmail, isAllowedEmailDomain, redirectTo } from '@/lib/auth';
import { getCommercialParEmail, listCommerciaux, upsertCommercial } from '@/lib/one-on-one-store';
import { nouvelId } from '@/lib/one-on-one';
import { baseSuivi, espaceDeRequete } from '@/lib/espace';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const espace = espaceDeRequete(req);
  const fiches = `${baseSuivi(espace)}/commerciaux`;
  const a = await acces(espace);
  if (a.role === 'AUCUN') return refus('unauthorized');
  if (!peutAdministrer(a)) return refus('forbidden');

  const form = await req.formData();
  const id = String(form.get('id') ?? '').trim();
  const nom = String(form.get('nom') ?? '').trim();
  // Espace direction : aucun accès ne se délègue par fiche (cf. lib/access.ts). On n'enregistre
  // donc jamais ces deux champs, même si un formulaire forgé les envoie.
  const france = espace === 'direction';
  const email = france ? '' : String(form.get('email') ?? '').trim().toLowerCase();
  const managerEmail = france ? '' : String(form.get('managerEmail') ?? '').trim().toLowerCase();

  if (!nom) return redirectTo(`${fiches}?error=nom`);

  if (email) {
    if (!isValidEmail(email)) return redirectTo(`${fiches}?error=email`);
    // Même règle que l'inscription : pas d'adresse externe rattachée à une fiche interne.
    if (!isAllowedEmailDomain(email)) return redirectTo(`${fiches}?error=domaine`);
    // Un administrateur voit déjà tout : lui créer une fiche de suivi brouille le calcul de rôle
    // (estEmailAdmin gagne dans acces(), la fiche serait ignorée).
    if (estEmailAdmin(email)) return redirectTo(`${fiches}?error=manager`);
    const deja = await getCommercialParEmail(espace, email);
    if (deja && deja.id !== id) return redirectTo(`${fiches}?error=email-pris`);
  }

  if (managerEmail) {
    if (!isValidEmail(managerEmail)) return redirectTo(`${fiches}?error=manager-email`);
    if (!isAllowedEmailDomain(managerEmail)) return redirectTo(`${fiches}?error=domaine`);
    // Être son propre manager ouvrirait sa propre zone privée (lib/access.ts l'ignore aussi).
    if (managerEmail === email) return redirectTo(`${fiches}?error=soi-meme`);
  }

  const existants = await listCommerciaux(espace, true);
  const existant = id ? existants.find((c) => c.id === id) : undefined;
  if (id && !existant) return redirectTo(`${fiches}?error=introuvable`);

  await upsertCommercial(espace, {
    id: existant?.id ?? nouvelId(espace === 'direction' ? 'da' : 'com'),
    nom,
    libelleBoond: String(form.get('libelleBoond') ?? '').trim(),
    email,
    managerEmail,
    pole: String(form.get('pole') ?? '').trim(),
    objectifAnnuel: Number(
      String(form.get('objectifAnnuel') ?? '0').replace(/\s/g, '').replace(',', '.'),
    ) || 0,
    actif: form.get('actif') !== null,
  });

  return redirectTo(`${fiches}?ok=1`);
}
