// Extraction automatique de la trame d'entretien depuis une transcription Google Meet.
//
// ÉTAT : interface posée, connecteur NON branché. Aucun appel réseau n'est effectué.
//
// Pourquoi ce fichier existe déjà sans faire le travail : le point d'entrée, les garde-fous et
// les règles de sécurité sont décidés maintenant, à froid. Brancher un fournisseur reviendra à
// écrire une seule fonction (appelerModele) sans toucher au reste. Cela évite qu'au moment de
// l'intégration, sous pression, quelqu'un court-circuite les règles ci-dessous.
//
// ------------------------------------------------------------------------------------------
// AVANT DE BRANCHER QUOI QUE CE SOIT — trois conditions non négociables :
//
//   1. Validation écrite de la DRH sur le fournisseur retenu. Une transcription de 1:1 contient
//      des propos d'un salarié sur sa charge, ses difficultés et sa rémunération. L'envoyer à un
//      tiers est un nouveau traitement, distinct de l'accord donné sur l'enregistrement Meet.
//   2. Un contrat de sous-traitance (DPA) et, de préférence, un hébergement UE. Vertex AI est le
//      candidat le plus simple à faire passer : Google est déjà sous contrat pour Workspace.
//   3. Aucune conservation des données par le fournisseur (opt-out d'entraînement explicite).
//
// ------------------------------------------------------------------------------------------
// RÈGLE DE SÉCURITÉ QUI SURVIT AU BRANCHEMENT :
//
// Le résultat de l'extraction alimente UNIQUEMENT la zone partagée et la liste d'actions, et
// TOUJOURS dans un entretien au statut BROUILLON. Le manager relit, corrige, puis partage
// explicitement. Un modèle qui résume une conversation ne distingue pas ce qui relevait de la
// confidence : sans relecture humaine, une remarque sur le moral finira un jour dans le compte
// rendu lu par le commercial. C'est le mode d'échec normal, pas un cas limite.
import type { ZonePartagee } from './one-on-one';
import { canalActif, genererJson } from './vertex';

/** Proposition d'action extraite d'une transcription. Aucune n'est créée sans validation. */
export interface ActionProposee {
  libelle: string;
  porteur: 'COMMERCIAL' | 'MANAGER';
  echeance: string | null; // 'YYYY-MM-DD'
}

export interface TrameExtraite {
  partage: Partial<ZonePartagee>;
  actions: ActionProposee[];
}

/**
 * Fournisseur configuré, ou null. Tant que la configuration est incomplète, la fonctionnalité est
 * invisible dans l'interface et l'API refuse la demande. Fail-closed, comme MANAGER_EMAILS.
 *
 * Modèle retenu : Claude, joignable par deux canaux (Vertex AI ou API Anthropic directe) — voir
 * lib/vertex.ts. Renvoie le nom du canal actif, utile pour diagnostiquer une configuration où
 * les deux sont renseignés.
 */
export function fournisseurConfigure(): string | null {
  return canalActif();
}

export function extractionDisponible(): boolean {
  return fournisseurConfigure() !== null;
}

/** Levée quand on tente d'extraire sans configuration valide. */
export class ExtractionIndisponible extends Error {
  constructor() {
    super(
      "L'extraction automatique n'est pas configurée. Renseigner soit ANTHROPIC_API_KEY (API " +
        'directe), soit VERTEX_PROJECT_ID et les identifiants du compte de service Google ' +
        '(voir .env.example).',
    );
    this.name = 'ExtractionIndisponible';
  }
}

/**
 * Consigne destinée au modèle. Définie ici plutôt que dans le connecteur : c'est une règle
 * métier, pas un détail d'implémentation.
 *
 * Le point essentiel est la dernière instruction : le modèle doit ÉCARTER ce qui relève de
 * l'intime. Elle ne suffit pas à elle seule — d'où l'obligation de relecture — mais elle réduit
 * nettement le volume à corriger.
 */
export const CONSIGNE = `Tu analyses la transcription d'un entretien individuel entre un manager et un commercial.

Remplis une trame de compte rendu PROFESSIONNEL destiné à être lu par le commercial lui-même.

Rubriques à remplir, uniquement à partir de ce qui a réellement été dit :
- pipelineCommentaire : lecture des chiffres, écart avec l'objectif, prévisions de signature
- dealsARisque : affaires bloquées, comptes à relancer, aide attendue du manager
- activiteAmont : prospection, rendez-vous, ouverture de comptes
- administratif : saisie CRM, CRA, notes de frais, congés
- developpement : montée en compétences, formation, accompagnement
- pointsCles : décisions prises et conclusions

Extrais aussi les actions décidées, avec leur porteur (commercial ou manager) et leur échéance
si elle a été énoncée.

RÈGLE IMPÉRATIVE : n'inclus RIEN qui relève de la vie personnelle, de la santé, du moral, de la
rémunération, d'un projet de départ ou d'une confidence. Ces éléments doivent être écartés de la
trame, même s'ils ont été abordés pendant l'entretien. En cas de doute, écarte.

N'invente jamais un chiffre, un nom de client ou une échéance qui n'apparaît pas dans la
transcription. Laisse une rubrique vide plutôt que de la combler.`;

/**
 * Point d'entrée unique de l'extraction.
 *
 * POUR BRANCHER UN FOURNISSEUR : implémenter l'appel dans ce corps de fonction, en respectant le
 * contrat de retour (TrameExtraite) et sans jamais renvoyer autre chose que des rubriques de la
 * zone partagée. Ne pas ajouter de champ qui alimenterait la zone privée : l'appréciation du
 * manager sur son commercial doit rester écrite par le manager.
 */
/**
 * Schéma imposé au modèle (`input_schema` de l'outil forcé, cf. lib/vertex.ts).
 *
 * Il ne contient QUE des rubriques de la zone partagée : le modèle n'a structurellement aucun
 * champ où déposer une appréciation sur le moral ou un sujet RH. C'est une barrière bien plus
 * fiable qu'une consigne en langage naturel — on ne compte pas sur son obéissance, on ne lui
 * laisse pas d'endroit où écrire.
 */
const SCHEMA = {
  type: 'object',
  properties: {
    pipelineCommentaire: {
      type: 'string',
      description: 'Lecture des chiffres, écart avec l’objectif, prévisions de signature.',
    },
    dealsARisque: {
      type: 'string',
      description: 'Affaires bloquées, comptes à relancer, aide attendue du manager.',
    },
    activiteAmont: {
      type: 'string',
      description: 'Prospection, rendez-vous tenus, ouverture de comptes.',
    },
    administratif: { type: 'string', description: 'Saisie CRM, CRA, notes de frais, congés.' },
    developpement: {
      type: 'string',
      description: 'Montée en compétences, formation, accompagnement terrain.',
    },
    pointsCles: { type: 'string', description: 'Décisions prises et conclusions de la séance.' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          libelle: { type: 'string' },
          porteur: { type: 'string', enum: ['COMMERCIAL', 'MANAGER'] },
          echeance: {
            type: 'string',
            description: 'Date au format AAAA-MM-JJ, ou chaîne vide si non énoncée.',
          },
        },
        required: ['libelle', 'porteur'],
        // Interdit au modèle d'inventer des champs supplémentaires dans une action.
        additionalProperties: false,
      },
    },
  },
  required: ['pointsCles'],
  // Barrière structurelle : le modèle ne peut pas ajouter de propriété hors de cette liste.
  // C'est le complément de validerReponse() — l'une contraint en amont, l'autre nettoie en aval.
  additionalProperties: false,
} as const;

const RUBRIQUES: (keyof ZonePartagee)[] = [
  'pipelineCommentaire',
  'dealsARisque',
  'activiteAmont',
  'administratif',
  'developpement',
  'pointsCles',
];

/** Coupe une valeur trop longue : un modèle qui part en digression ne doit pas remplir la base. */
function texteSur(v: unknown, max = 4000): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/**
 * Valide et normalise la réponse du modèle.
 *
 * Exportée pour être testable sans appel réseau. Principe : liste blanche stricte. Tout champ
 * non prévu est ignoré, tout type incorrect est écarté, rien n'est repris tel quel. Un schéma de
 * sortie contraint la forme côté fournisseur ; il ne dispense pas de vérifier chez soi.
 */
export function validerReponse(brut: unknown): TrameExtraite {
  const o = (brut ?? {}) as Record<string, unknown>;

  const partage: Partial<ZonePartagee> = {};
  for (const cle of RUBRIQUES) {
    const v = texteSur(o[cle]);
    if (v) partage[cle] = v;
  }

  const brutActions = Array.isArray(o.actions) ? o.actions : [];
  const actions: ActionProposee[] = [];
  for (const a of brutActions.slice(0, 20)) {
    const item = (a ?? {}) as Record<string, unknown>;
    const libelle = texteSur(item.libelle, 300);
    if (!libelle) continue; // une action sans intitulé n'a aucune valeur
    const echeance = texteSur(item.echeance, 10);
    actions.push({
      libelle,
      porteur: item.porteur === 'MANAGER' ? 'MANAGER' : 'COMMERCIAL',
      // Seules les dates au bon format sont retenues : le modèle produit parfois « la semaine
      // prochaine » ou une date inventée d'un autre format.
      echeance: /^\d{4}-\d{2}-\d{2}$/.test(echeance) ? echeance : null,
    });
  }

  return { partage, actions };
}

export async function extraireTrame(transcription: string): Promise<TrameExtraite> {
  if (!fournisseurConfigure()) throw new ExtractionIndisponible();

  // Garde de coût et de bon sens : une transcription vide ou minuscule ne justifie pas un appel.
  if (transcription.trim().length < 200) {
    return { partage: {}, actions: [] };
  }

  // Plafond d'entrée : au-delà, on tronque plutôt que de faire échouer l'appel sur la limite de
  // contexte. Un 1:1 d'une heure tient largement en dessous.
  const contenu = transcription.slice(0, 200_000);

  const brut = await genererJson(CONSIGNE, contenu, SCHEMA as unknown as Record<string, unknown>);
  return validerReponse(brut);
}

/**
 * Nettoie une transcription Google Meet collée depuis le Doc.
 *
 * Le Doc contient un en-tête (titre de la réunion, date, liste des participants) et un pied de
 * page invariables. On les retire pour ne pas les envoyer au modèle ni encombrer l'affichage.
 * Fonction pure, testée — c'est aussi elle qui rend le collage supportable à l'écran.
 */
export function nettoyerTranscription(brut: string): string {
  let t = brut.replace(/\r\n/g, '\n').trim();

  // Pied de page ajouté par Google dans le document de transcription.
  const piedDePage = t.search(
    /Cette transcription|This transcript|Ce document a été généré|was generated by Google Meet/i,
  );
  if (piedDePage > 200) t = t.slice(0, piedDePage).trim();

  // En-tête : tout ce qui précède la première prise de parole horodatée ou nommée.
  // Format Meet : « Prénom Nom: propos » ou « 00:03:12 Prénom Nom: propos ».
  //
  // Le caractère qui précède les deux-points ne doit pas être une espace. Sans cette contrainte,
  // la ligne « Participants : Pascal, Alex » de l'en-tête passe pour une prise de parole et
  // l'en-tête n'est plus retiré. Les noms Meet s'écrivent toujours « Nom: », jamais « Nom : ».
  const lignes = t.split('\n');
  const premiereParole = lignes.findIndex((l) =>
    /^(\d{1,2}:\d{2}(:\d{2})?\s+)?[^:\s][^:]{0,58}[^:\s]:\s/.test(l.trim()),
  );
  if (premiereParole > 0) t = lignes.slice(premiereParole).join('\n').trim();

  // Lignes vides multiples -> une seule, pour l'affichage.
  return t.replace(/\n{3,}/g, '\n\n');
}
