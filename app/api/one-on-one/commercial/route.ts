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
import { estModeFrance } from '@/lib/perimetre';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const a = await acces();
  if (a.role === 'AUCUN') return refus('unauthorized');
  if (!peutAdministrer(a)) return refus('forbidden');

  const form = await req.formData();
  const id = String(form.get('id') ?? '').trim();
  const nom = String(form.get('nom') ?? '').trim();
  // Périmètre France : aucun accès ne se délègue par fiche (cf. lib/access.ts). On n'enregistre
  // donc jamais ces deux champs, même si un formulaire forgé les envoie.
  const france = estModeFrance();
  const email = france ? '' : String(form.get('email') ?? '').trim().toLowerCase();
  const managerEmail = france ? '' : String(form.get('managerEmail') ?? '').trim().toLowerCase();

  if (!nom) return redirectTo('/1-1/commerciaux?error=nom');

  if (email) {
    if (!isValidEmail(email)) return redirectTo('/1-1/commerciaux?error=email');
    // Même règle que l'inscription : pas d'adresse externe rattachée à une fiche interne.
    if (!isAllowedEmailDomain(email)) return redirectTo('/1-1/commerciaux?error=domaine');
    // Un administrateur voit déjà tout : lui créer une fiche de suivi brouille le calcul de rôle
    // (estEmailAdmin gagne dans acces(), la fiche serait ignorée).
    if (estEmailAdmin(email)) return redirectTo('/1-1/commerciaux?error=manager');
    const deja = await getCommercialParEmail(email);
    if (deja && deja.id !== id) return redirectTo('/1-1/commerciaux?error=email-pris');
  }

  if (managerEmail) {
    if (!isValidEmail(managerEmail)) return redirectTo('/1-1/commerciaux?error=manager-email');
    if (!isAllowedEmailDomain(managerEmail)) return redirectTo('/1-1/commerciaux?error=domaine');
    // Être son propre manager ouvrirait sa propre zone privée (lib/access.ts l'ignore aussi).
    if (managerEmail === email) return redirectTo('/1-1/commerciaux?error=soi-meme');
  }

  const existants = await listCommerciaux(true);
  const existant = id ? existants.find((c) => c.id === id) : undefined;
  if (id && !existant) return redirectTo('/1-1/commerciaux?error=introuvable');

  await upsertCommercial({
    id: existant?.id ?? nouvelId('com'),
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

  return redirectTo('/1-1/commerciaux?ok=1');
}
