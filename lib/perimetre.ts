// Périmètre de l'instance : une AGENCE (usage historique, pilotage par un directeur d'agence) ou
// la FRANCE (usage direction générale : toutes les agences, OTO des directeurs d'agence).
//
// Même code, deux déploiements distincts, chacun avec SA base de données. C'est le choix
// structurant : l'import CSV « remplace tout » et les comptes rendus d'OTO du DG portent sur les
// directeurs d'agence eux-mêmes. Les mélanger dans une même base ferait (1) écraser l'import
// d'une agence par l'import France, (2) lire aux administrateurs d'agence les OTO qui les
// concernent. Une instance par périmètre supprime ces deux risques sans logique de cloisonnement
// supplémentaire.
//
// Variable : APP_PERIMETRE=france. Toute autre valeur (ou absence) = agence, le comportement
// historique — une instance d'agence déjà en production n'a rien à changer.
import type { Chiffres, ZonePartagee } from './one-on-one';

export type Perimetre = 'agence' | 'france';

export function perimetre(): Perimetre {
  return (process.env.APP_PERIMETRE ?? '').trim().toLowerCase() === 'france' ? 'france' : 'agence';
}

export function estModeFrance(): boolean {
  return perimetre() === 'france';
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
// d'agence. Réutiliser le stockage évite toute migration de schéma : les deux instances ont
// des bases distinctes, un même champ n'y est jamais lu avec deux sens différents.
const VOCAB_FRANCE: Vocabulaire = {
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

export function vocabulaire(p: Perimetre = perimetre()): Vocabulaire {
  return p === 'france' ? VOCAB_FRANCE : VOCAB_AGENCE;
}
