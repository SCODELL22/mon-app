// « Enregistrer et pré-remplir » : enregistre le formulaire, puis complète la trame à partir de
// la transcription via Vertex AI.
//
// Appelée par un second bouton du formulaire de saisie (attribut `formaction`), donc elle reçoit
// exactement les mêmes champs que la route d'enregistrement. Elle réutilise la même fonction de
// lecture — l'enregistrement n'est jamais dupliqué.
//
// Trois garanties, dans cet ordre d'importance :
//   1. l'entretien reste (ou repasse) en BROUILLON — rien ne devient visible du commercial ;
//   2. seule la zone partagée est alimentée : la zone privée reste écrite par le manager ;
//   3. les rubriques déjà remplies à la main ne sont pas écrasées.
//
// Le troisième point compte plus qu'il n'y paraît : sans lui, un clic malencontreux effacerait
// un compte rendu déjà rédigé.
import { acces, peutEcrire, refus } from '@/lib/access';
import { redirectTo } from '@/lib/auth';
import { getCommercial, listActions, upsertAction, upsertOneOnOne } from '@/lib/one-on-one-store';
import { enregistrerEntretien } from '@/lib/one-on-one-formulaire';
import { ExtractionIndisponible, extractionDisponible, extraireTrame } from '@/lib/extraction-trame';
import { nouvelId, type ZonePartagee } from '@/lib/one-on-one';

export const dynamic = 'force-dynamic';
// L'appel au modèle dépasse la durée par défaut de certains hébergeurs sur une longue transcription.
export const maxDuration = 120;

export async function POST(req: Request) {
  const a = await acces();
  if (a.role === 'AUCUN') return refus('unauthorized');
  if (!peutEcrire(a)) return refus('forbidden');

  const form = await req.formData();

  const commercial = await getCommercial(String(form.get('commercialId') ?? '').trim());
  if (!commercial) return redirectTo('/1-1?error=commercial-inconnu');

  // On enregistre TOUJOURS d'abord : même si l'extraction échoue derrière, la saisie du manager
  // n'est jamais perdue.
  const entretien = await enregistrerEntretien(form, a.email);

  if (!extractionDisponible()) {
    return redirectTo(`/1-1/nouveau?id=${entretien.id}&erreur=extraction-indisponible`);
  }
  if (!entretien.transcription.trim()) {
    return redirectTo(`/1-1/nouveau?id=${entretien.id}&erreur=pas-de-transcription`);
  }

  let resultat;
  try {
    resultat = await extraireTrame(entretien.transcription);
  } catch (e) {
    // L'erreur détaillée reste dans les journaux serveur : elle peut contenir des éléments de la
    // requête, donc de la transcription. L'utilisateur reçoit un message générique.
    console.error('[extraction] échec', e);
    const code =
      e instanceof ExtractionIndisponible ? 'extraction-indisponible' : 'extraction-echec';
    return redirectTo(`/1-1/nouveau?id=${entretien.id}&erreur=${code}`);
  }

  // Fusion NON destructive : on ne remplit que les rubriques laissées vides.
  const partageFusionne: ZonePartagee = { ...entretien.partage };
  let remplies = 0;
  for (const [cle, valeur] of Object.entries(resultat.partage) as [keyof ZonePartagee, string][]) {
    if (!partageFusionne[cle]?.trim() && valeur) {
      partageFusionne[cle] = valeur;
      remplies++;
    }
  }

  await upsertOneOnOne({
    ...entretien,
    partage: partageFusionne,
    // Ceinture et bretelles : même si l'entretien avait été partagé, une extraction le ramène en
    // brouillon. Du texte produit par un modèle ne doit jamais rester lisible sans relecture.
    statut: 'BROUILLON',
    partageLe: null,
  });

  // Actions proposées : ajoutées seulement si leur intitulé n'existe pas déjà, pour qu'une
  // seconde extraction ne duplique pas la liste.
  const existantes = await listActions({ oneOnOneId: entretien.id });
  const deja = new Set(existantes.map((x) => x.libelle.trim().toLowerCase()));
  let ajoutees = 0;
  for (const p of resultat.actions) {
    if (deja.has(p.libelle.trim().toLowerCase())) continue;
    await upsertAction({
      id: nouvelId('act'),
      oneOnOneId: entretien.id,
      commercialId: entretien.commercialId,
      libelle: p.libelle,
      porteur: p.porteur,
      echeance: p.echeance,
      statut: 'OUVERTE',
    });
    deja.add(p.libelle.trim().toLowerCase());
    ajoutees++;
  }

  return redirectTo(`/1-1/nouveau?id=${entretien.id}&extrait=${remplies}&actions=${ajoutees}`);
}
