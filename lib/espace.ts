// Espaces de l'application. Une même instance héberge deux suivis étanches :
//   - AGENCE    : le pilotage historique du directeur d'agence (/, /1-1). Rôles définis dans
//                 lib/access.ts (MANAGER_EMAILS, managers d'équipe, commerciaux).
//   - DIRECTION : l'outil du directeur général (/france, /oto-da) — pipeline de toutes les
//                 agences et OTO des directeurs d'agence. Réservé aux emails de DG_EMAILS.
//
// L'étanchéité repose sur deux règles, à ne jamais contourner :
//   1. STOCKAGE SÉPARÉ : chaque espace a ses propres tables / fichiers (lib/store.ts,
//      lib/one-on-one-store.ts). Un identifiant d'un espace ne se résout jamais dans l'autre.
//   2. DROITS SÉPARÉS : acces(espace) calcule les droits pour CET espace. Être administrateur de
//      l'espace agence ne donne aucun droit sur l'espace direction, et inversement.
//
// Limite assumée (choix du propriétaire de l'application) : qui administre l'hébergement et la
// base de données peut techniquement lire les deux espaces. L'étanchéité vaut dans l'application.
import type { Chiffres, ZonePartagee } from './one-on-one';

export type Espace = 'agence' | 'direction';

/** Lecture tolérante d'un paramètre (formulaire, URL) : tout ce qui n'est pas « direction » = agence. */
export function espaceDe(v: unknown): Espace {
  return String(v ?? '').trim().toLowerCase() === 'direction' ? 'direction' : 'agence';
}

/** Espace demandé par une requête API : paramètre d'URL `?espace=`. Défaut : agence. */
export function espaceDeRequete(req: Request): Espace {
  return espaceDe(new URL(req.url).searchParams.get('espace'));
}

/** Suffixe d'URL à ajouter aux appels API d'un espace (vide pour l'agence). */
export function qsEspace(espace: Espace): string {
  return espace === 'direction' ? '?espace=direction' : '';
}

/** Racine des écrans de suivi de l'espace. */
export function baseSuivi(espace: Espace): string {
  return espace === 'direction' ? '/oto-da' : '/1-1';
}

/** Page du pipeline de l'espace. */
export function basePipeline(espace: Espace): string {
  return espace === 'direction' ? '/france' : '/';
}

export interface Rubrique {
  titre: string;
  placeholder: string;
  /** Description transmise au modèle pour le pré-remplissage depuis la transcription. */
  description: string;
}

export interface Vocabulaire {
  /** Nom commun de la personne suivie, en minuscules (« commercial »). */
  suivi: string;
  /** Même chose, pluriel, en minuscules. */
  suivis: string;
  /** Libellé court pour les en-têtes de colonnes et les sélecteurs. */
  suiviCourt: string;
  /** Libellé court de la personne qui mène l'entretien. */
  manager: string;
  /** Nom de l'entretien (« 1:1 », « OTO »). */
  entretien: string;
  titreModule: string;
  /** Colonne de l'export BoondManager qui rattache la fiche aux opportunités. */
  rattachement: {
    champ: 'commercial' | 'agence';
    colonneBoond: string;
    label: string;
    placeholder: string;
  };
  chiffres: Record<keyof Chiffres, string>;
  rubriques: Record<keyof ZonePartagee, Rubrique>;
  /** Contexte donné au modèle en tête de consigne. */
  contexteExtraction: string;
}

const VOCAB_AGENCE: Vocabulaire = {
  suivi: 'commercial',
  suivis: 'commerciaux',
  suiviCourt: 'Commercial',
  manager: 'Manager',
  entretien: '1:1',
  titreModule: 'Suivi des 1:1',
  rattachement: {
    champ: 'commercial',
    colonneBoond: 'Responsable manager',
    label: 'Libellé BoondManager',
    placeholder: 'Responsable manager, à l’identique',
  },
  chiffres: {
    caSigne: 'CA signé (€ HT)',
    pipelinePondere: 'Pipeline pondéré déclaré (€)',
    nbRdv: 'RDV tenus',
    nbNouveauxComptes: 'Nouveaux comptes ouverts',
  },
  rubriques: {
    pipelineCommentaire: {
      titre: 'Lecture des chiffres et du pipeline',
      placeholder: 'Écart vs objectif, qualité du pipeline, prévisions de signature…',
      description: 'Lecture des chiffres, écart avec l’objectif, prévisions de signature.',
    },
    dealsARisque: {
      titre: 'Deals à risque et blocages',
      placeholder: 'Affaires bloquées, comptes à relancer, aide attendue du manager…',
      description: 'Affaires bloquées, comptes à relancer, aide attendue du manager.',
    },
    activiteAmont: {
      titre: 'Activité amont',
      placeholder: 'Prospection, RDV pris, ouverture de comptes — les indicateurs avancés.',
      description: 'Prospection, rendez-vous tenus, ouverture de comptes.',
    },
    administratif: {
      titre: 'Administratif',
      placeholder: 'Saisie Boond, CRA, notes de frais, congés…',
      description: 'Saisie CRM, CRA, notes de frais, congés.',
    },
    developpement: {
      titre: 'Développement et montée en compétences',
      placeholder: 'Plan de progression, formation, accompagnement terrain.',
      description: 'Montée en compétences, formation, accompagnement terrain.',
    },
    pointsCles: {
      titre: 'Points clés et décisions',
      placeholder: 'Ce qui est décidé, à retenir de la séance.',
      description: 'Décisions prises et conclusions de la séance.',
    },
  },
  contexteExtraction: 'un entretien individuel entre un manager et un commercial',
};

// Mêmes champs de stockage que la trame commerciale, rubriques relues pour un directeur
// d'agence. Les tables de l'espace direction sont distinctes : un même champ n'est jamais lu
// avec deux sens différents.
const VOCAB_DIRECTION: Vocabulaire = {
  suivi: 'directeur d’agence',
  suivis: 'directeurs d’agence',
  suiviCourt: 'DA',
  manager: 'DG',
  entretien: 'OTO',
  titreModule: 'OTO des directeurs d’agence',
  rattachement: {
    champ: 'agence',
    colonneBoond: 'Agence',
    label: 'Agence (export BoondManager)',
    placeholder: 'Valeur de la colonne Agence, à l’identique',
  },
  chiffres: {
    caSigne: 'CA signé agence depuis janvier (€ HT)',
    pipelinePondere: 'Pipeline pondéré annoncé (€)',
    nbRdv: 'RDV clients de l’agence',
    nbNouveauxComptes: 'Nouveaux comptes ouverts',
  },
  rubriques: {
    pipelineCommentaire: {
      titre: 'Chiffres agence vs objectif',
      placeholder: 'CA, marge, pipeline pondéré, atterrissage annoncé, écart à l’objectif…',
      description:
        'Chiffres de l’agence : CA, marge, pipeline, atterrissage annoncé, écart avec l’objectif.',
    },
    dealsARisque: {
      titre: 'Deals à risque et comptes clés',
      placeholder: 'Affaires bloquées, grands comptes, renouvellements, appui attendu du DG…',
      description:
        'Affaires à risque, grands comptes, renouvellements, appui attendu de la direction générale.',
    },
    activiteAmont: {
      titre: 'Qualité CRM et dynamique commerciale',
      placeholder:
        'Besoins à date de démarrage ou de clôture dépassée, pôle « Business development » à corriger, prospection de l’équipe…',
      description:
        'Qualité de saisie dans le CRM (dates de démarrage ou de clôture dépassées, pôle mal renseigné) et dynamique commerciale de l’équipe.',
    },
    administratif: {
      titre: 'Staffing, intercontrat et recrutement',
      placeholder: 'Intercontrats, fins de mission, besoins non staffés, plan de recrutement…',
      description: 'Staffing, intercontrats, fins de mission, recrutement.',
    },
    developpement: {
      titre: 'Management de l’équipe',
      placeholder: 'Organisation, montée en compétences des commerciaux, sujets d’équipe…',
      description: 'Management et organisation de l’équipe d’agence, développement des managers.',
    },
    pointsCles: {
      titre: 'Décisions et points clés',
      placeholder: 'Ce qui est décidé, à retenir de la séance.',
      description: 'Décisions prises et conclusions de la séance.',
    },
  },
  contexteExtraction:
    'un entretien individuel (OTO) entre le directeur général et un directeur d’agence',
};

export function vocabulaire(espace: Espace): Vocabulaire {
  return espace === 'direction' ? VOCAB_DIRECTION : VOCAB_AGENCE;
}
