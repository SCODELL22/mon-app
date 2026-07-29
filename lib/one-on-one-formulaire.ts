// Lecture du formulaire de saisie d'un entretien.
//
// Extrait des routes pour être partagé par /api/one-on-one/entretien (« Enregistrer ») et
// /api/one-on-one/extraction (« Enregistrer et pré-remplir »). Les deux boutons soumettent le
// MÊME formulaire : sans cette factorisation, la seconde route réécrirait la logique
// d'enregistrement, et les deux divergeraient au premier changement de trame.
import {
  aujourdHui,
  nouvelId,
  type ActionPorteur,
  type ActionStatut,
  type Humeur,
  type OneOnOne,
  type OneOnOneInput,
} from './one-on-one';
import { nettoyerTranscription } from './extraction-trame';
import { getOneOnOne, listActions, upsertAction, upsertOneOnOne } from './one-on-one-store';

const STATUTS_VALIDES: ActionStatut[] = ['OUVERTE', 'EN_COURS', 'FAITE', 'ABANDONNEE'];

function texte(form: FormData, cle: string): string {
  return String(form.get(cle) ?? '').trim();
}

function nombre(form: FormData, cle: string): number {
  // Saisie française tolérée : « 1 250,50 » et « 1250.50 » donnent le même résultat.
  const brut = texte(form, cle).replace(/\s/g, '').replace(',', '.');
  const n = Number(brut);
  return Number.isFinite(n) ? n : 0;
}

function dateOuNull(form: FormData, cle: string): string | null {
  const v = texte(form, cle);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/**
 * Enregistre l'entretien décrit par le formulaire, ainsi que ses actions, et renvoie l'entretien
 * tel qu'il a été persisté.
 *
 * `emailAuteur` n'est utilisé qu'à la création : en édition, l'auteur d'origine est conservé.
 * Réécrire ce champ ferait passer pour sien un entretien mené par un autre manager.
 */
export async function enregistrerEntretien(
  form: FormData,
  emailAuteur: string,
): Promise<OneOnOne> {
  const id = texte(form, 'id');
  const commercialId = texte(form, 'commercialId');
  const existant = id ? await getOneOnOne(id) : null;
  const entretienId = existant?.id ?? nouvelId('o3');

  const humeurBrute = Number(texte(form, 'humeur'));
  const humeur: Humeur | null =
    humeurBrute >= 1 && humeurBrute <= 5 ? ((humeurBrute | 0) as Humeur) : null;

  const moral = texte(form, 'moral');
  const notesRh = texte(form, 'notesRh');

  const entree: OneOnOneInput = {
    id: entretienId,
    commercialId,
    date: dateOuNull(form, 'date') ?? aujourdHui(),
    auteurEmail: existant?.auteurEmail || emailAuteur,
    // Un entretien naît TOUJOURS en brouillon ; une édition conserve le statut courant.
    // Le partage ne se fait que par /api/one-on-one/partage, sur un geste explicite.
    statut: existant?.statut ?? 'BROUILLON',
    partageLe: existant?.partageLe ?? null,
    chiffres: {
      caSigne: nombre(form, 'caSigne'),
      pipelinePondere: nombre(form, 'pipelinePondere'),
      nbRdv: nombre(form, 'nbRdv'),
      nbNouveauxComptes: nombre(form, 'nbNouveauxComptes'),
    },
    partage: {
      pipelineCommentaire: texte(form, 'pipelineCommentaire'),
      dealsARisque: texte(form, 'dealsARisque'),
      activiteAmont: texte(form, 'activiteAmont'),
      administratif: texte(form, 'administratif'),
      developpement: texte(form, 'developpement'),
      pointsCles: texte(form, 'pointsCles'),
    },
    // Zone privée laissée à null si rien n'a été saisi : évite d'accumuler des objets vides.
    prive: moral || notesRh || humeur !== null ? { moral, humeur, notesRh } : null,
    notesBrutes: texte(form, 'notesBrutes'),
    // Nettoyée à l'entrée plutôt qu'à l'affichage : on ne stocke pas l'en-tête et le pied de
    // page ajoutés par Google, qui n'apportent rien et alourdissent chaque enregistrement.
    transcription: nettoyerTranscription(texte(form, 'transcription')),
  };

  const enregistre = await upsertOneOnOne(entree);

  // --- Actions décidées pendant la séance -----------------------------------
  // Champs répétés : action_libelle / action_porteur / action_echeance / action_id / action_statut.
  // getAll() garantit l'ordre du DOM, donc l'alignement des index entre les 5 listes.
  const libelles = form.getAll('action_libelle').map((v) => String(v).trim());
  const porteurs = form.getAll('action_porteur').map((v) => String(v));
  const echeances = form.getAll('action_echeance').map((v) => String(v));
  const ids = form.getAll('action_id').map((v) => String(v));
  const statuts = form.getAll('action_statut').map((v) => String(v));

  for (let i = 0; i < libelles.length; i++) {
    const libelle = libelles[i];
    if (!libelle) continue; // ligne vide du formulaire : ignorée, pas une erreur
    const statut = STATUTS_VALIDES.includes(statuts[i] as ActionStatut)
      ? (statuts[i] as ActionStatut)
      : 'OUVERTE';
    await upsertAction({
      id: ids[i] || nouvelId('act'),
      oneOnOneId: entretienId,
      commercialId,
      libelle,
      porteur:
        porteurs[i] === 'MANAGER' ? ('MANAGER' as ActionPorteur) : ('COMMERCIAL' as ActionPorteur),
      echeance: /^\d{4}-\d{2}-\d{2}$/.test(echeances[i] ?? '') ? echeances[i] : null,
      statut,
    });
  }

  // --- Report des actions de la séance précédente ---------------------------
  // Le formulaire liste les actions encore ouvertes des entretiens antérieurs, avec un sélecteur
  // de statut nommé `report_<idAction>`. On ne touche qu'à celles dont le statut a changé.
  const anciennes = await listActions({ commercialId });
  for (const act of anciennes) {
    if (act.oneOnOneId === entretienId) continue; // déjà traitée au-dessus
    const nouveau = form.get(`report_${act.id}`);
    if (nouveau === null) continue;
    const statut = String(nouveau);
    if (!STATUTS_VALIDES.includes(statut as ActionStatut)) continue;
    if (statut === act.statut) continue;
    await upsertAction({ ...act, statut: statut as ActionStatut });
  }

  return enregistre;
}
