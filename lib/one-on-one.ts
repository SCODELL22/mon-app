// Domaine métier du suivi des 1:1 commerciaux — types et fonctions pures, sans dépendance
// technique (testable seul, cf. scripts/test-one-on-one.ts).
//
// Modèle à DEUX ZONES, choix structurant :
//   - zone PARTAGÉE  : le commercial concerné peut la lire (constat, chiffres, décisions, actions).
//   - zone MANAGER   : strictement privée (moral, sujets RH). Ne doit JAMAIS sortir de l'API pour
//                      un rôle non-manager — cf. lib/access.ts et stripPrivate() plus bas.
// Toute la sécurité du module repose sur ce cloisonnement : y toucher demande de relire les tests.

// ---------------------------------------------------------------- Commerciaux

export interface Commercial {
  id: string;
  nom: string; // Nom affiché dans l'app
  /**
   * Libellé EXACT du champ « Responsable manager » dans l'export BoondManager.
   * Sert à rattacher les opportunités (lib/store.ts) au commercial. Sans ce mapping, les noms
   * divergent au premier réimport et le pipeline affiché dans le 1:1 devient faux.
   */
  libelleBoond: string;
  /** Email du compte applicatif — permet au commercial de lire ses propres CR. Vide = pas d'accès. */
  email: string;
  pole: string;
  objectifAnnuel: number; // CA annuel HT visé
  actif: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CommercialInput = Omit<Commercial, 'createdAt' | 'updatedAt'>;

// ---------------------------------------------------------------- Actions

export type ActionStatut = 'OUVERTE' | 'EN_COURS' | 'FAITE' | 'ABANDONNEE';
export type ActionPorteur = 'COMMERCIAL' | 'MANAGER';

export interface Action {
  id: string;
  oneOnOneId: string; // entretien où l'action a été décidée
  commercialId: string; // dénormalisé : permet la vue transverse sans jointure
  libelle: string;
  porteur: ActionPorteur;
  echeance: string | null; // 'YYYY-MM-DD'
  statut: ActionStatut;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export type ActionInput = Omit<Action, 'createdAt' | 'updatedAt' | 'closedAt'> &
  Partial<Pick<Action, 'closedAt'>>;

export interface ActionStatutMeta {
  value: ActionStatut;
  label: string;
  ouverte: boolean;
  color: string;
}

// Couleurs alignées sur la charte Ippon utilisée dans public/pipeline.html.
export const ACTION_STATUTS: ActionStatutMeta[] = [
  { value: 'OUVERTE', label: 'À faire', ouverte: true, color: '#003CDC' },
  { value: 'EN_COURS', label: 'En cours', ouverte: true, color: '#FFC800' },
  { value: 'FAITE', label: 'Faite', ouverte: false, color: '#00CCA5' },
  { value: 'ABANDONNEE', label: 'Abandonnée', ouverte: false, color: '#B0B0B0' },
];

export const ACTION_STATUT_META: Record<ActionStatut, ActionStatutMeta> = Object.fromEntries(
  ACTION_STATUTS.map((s) => [s.value, s]),
) as Record<ActionStatut, ActionStatutMeta>;

/** Une action est « ouverte » tant qu'elle n'est ni faite ni abandonnée. */
export function isActionOuverte(statut: ActionStatut): boolean {
  return ACTION_STATUT_META[statut]?.ouverte ?? true;
}

/**
 * Action en retard = encore ouverte ET échéance strictement passée.
 * `today` est injecté plutôt que lu de l'horloge : sinon la fonction n'est pas testable.
 */
export function isEnRetard(a: Pick<Action, 'statut' | 'echeance'>, today: string): boolean {
  if (!isActionOuverte(a.statut)) return false;
  if (!a.echeance) return false;
  return a.echeance < today;
}

/** Nombre de jours entre deux dates 'YYYY-MM-DD' (négatif si `to` précède `from`). */
export function joursEntre(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

// ---------------------------------------------------------------- Entretiens 1:1

/** Ressenti du manager sur le moral, 1 (au plus bas) à 5 (au plus haut). Donnée PRIVÉE. */
export type Humeur = 1 | 2 | 3 | 4 | 5;

/** Chiffres relevés pendant l'entretien. Saisis à la main : ce sont les chiffres COMMENTÉS. */
export interface Chiffres {
  caSigne: number; // CA signé HT depuis le début de l'exercice
  /**
   * Pipeline pondéré déclaré. Reste facultatif : la valeur de référence est recalculée depuis
   * les opportunités BoondManager (lib/aggregations.ts) et affichée à côté pour comparaison.
   */
  pipelinePondere: number;
  nbRdv: number; // RDV tenus sur la période — indicateur avancé
  nbNouveauxComptes: number; // comptes ouverts sur la période
}

/** Partie du CR que le commercial concerné peut lire. */
export interface ZonePartagee {
  pipelineCommentaire: string; // lecture des chiffres, écarts vs objectif
  dealsARisque: string; // affaires bloquées, comptes à relancer, aide attendue du manager
  activiteAmont: string; // prospection, RDV, ouverture de comptes
  administratif: string; // CRA, notes de frais, saisie Boond, congés
  developpement: string; // montée en compétences, plan de progression
  pointsCles: string; // décisions et conclusions de la séance
}

/**
 * Partie du CR réservée au manager auteur. N'est jamais sérialisée vers un client non-manager.
 * `null` côté client = la zone existe peut-être mais n'a pas été transmise. Ne pas interpréter
 * `null` comme « pas de notes privées ».
 */
export interface ZoneManager {
  moral: string;
  humeur: Humeur | null;
  notesRh: string;
}

/**
 * Cycle de vie d'un entretien.
 *   BROUILLON : en cours de rédaction, invisible du commercial même s'il le concerne.
 *   PARTAGE   : relu par le manager et rendu lisible au commercial (zone partagée uniquement).
 *
 * Le brouillon est le statut par défaut, y compris pour les entretiens créés avant l'introduction
 * de ce champ : un compte rendu ne devient jamais visible sans un geste explicite du manager.
 */
export type StatutEntretien = 'BROUILLON' | 'PARTAGE';

export interface OneOnOne {
  id: string;
  commercialId: string;
  date: string; // 'YYYY-MM-DD' — date de l'entretien
  auteurEmail: string; // manager qui a mené l'entretien
  statut: StatutEntretien;
  /** Horodatage du partage. null tant que l'entretien est un brouillon. */
  partageLe: string | null;
  chiffres: Chiffres;
  partage: ZonePartagee;
  /** null si non transmis (rôle non autorisé) OU si le manager n'a rien saisi. Voir ZoneManager. */
  prive: ZoneManager | null;
  /** Notes brutes dictées avant mise en forme. Considérées comme PRIVÉES (non relues, non validées). */
  notesBrutes: string;
  /**
   * Transcription de la réunion, collée depuis Google Meet.
   *
   * PRIVÉE, et de la catégorie la plus sensible du module : c'est un verbatim intégral de propos
   * tenus par un salarié, y compris ce qu'il a dit en confiance. Elle est retirée par
   * stripPrivate() au même titre que la zone manager, et ne doit jamais être recopiée telle
   * quelle dans la zone partagée.
   *
   * Champ distinct de notesBrutes : l'un est produit par une machine, l'autre écrit par le
   * manager. Les confondre empêcherait de savoir ce qui a été relu.
   */
  transcription: string;
  createdAt: string;
  updatedAt: string;
}

/** Vrai si l'entretien a été explicitement partagé avec le commercial. */
export function estPartage(e: Pick<OneOnOne, 'statut'>): boolean {
  return e.statut === 'PARTAGE';
}

export type OneOnOneInput = Omit<OneOnOne, 'createdAt' | 'updatedAt'>;

/** Entretien accompagné de ses actions — ce que manipulent les écrans. */
export interface OneOnOneAvecActions extends OneOnOne {
  actions: Action[];
}

export const CHIFFRES_VIDES: Chiffres = {
  caSigne: 0,
  pipelinePondere: 0,
  nbRdv: 0,
  nbNouveauxComptes: 0,
};

export const ZONE_PARTAGEE_VIDE: ZonePartagee = {
  pipelineCommentaire: '',
  dealsARisque: '',
  activiteAmont: '',
  administratif: '',
  developpement: '',
  pointsCles: '',
};

// ---------------------------------------------------------------- Cloisonnement

/**
 * Retire tout ce qu'un non-manager n'a pas le droit de voir.
 * C'est LA fonction de sécurité du module : tout objet OneOnOne qui part vers un client dont le
 * rôle n'est pas « manager » doit passer par ici. Testée explicitement.
 */
export function stripPrivate<T extends OneOnOne>(o: T): T {
  return { ...o, prive: null, notesBrutes: '', transcription: '' };
}

/** Applique stripPrivate() à une liste si le lecteur n'est pas manager. */
export function visiblePour<T extends OneOnOne>(items: T[], estManager: boolean): T[] {
  return estManager ? items : items.map(stripPrivate);
}

// ---------------------------------------------------------------- Suivi hebdomadaire

/**
 * Clé de semaine ISO-8601 ('2026-S31') — base du suivi « semaine après semaine ».
 * ISO : la semaine 1 est celle qui contient le premier jeudi de l'année. Ne pas remplacer par un
 * calcul « jour de l'année / 7 », faux une année sur deux autour du 1er janvier.
 */
export function semaineIso(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  // On se place sur le jeudi de la semaine courante : son année est l'année ISO.
  const jour = (d.getUTCDay() + 6) % 7; // lundi = 0
  d.setUTCDate(d.getUTCDate() - jour + 3);
  const anneeIso = d.getUTCFullYear();
  const premierJeudi = new Date(Date.UTC(anneeIso, 0, 4));
  const jourPJ = (premierJeudi.getUTCDay() + 6) % 7;
  premierJeudi.setUTCDate(premierJeudi.getUTCDate() - jourPJ + 3);
  const numero = 1 + Math.round((d.getTime() - premierJeudi.getTime()) / (7 * 86_400_000));
  return `${anneeIso}-S${String(numero).padStart(2, '0')}`;
}

export interface SuiviCommercial {
  commercial: Commercial;
  dernierEntretien: OneOnOne | null;
  joursDepuisDernier: number | null;
  actionsOuvertes: number;
  actionsEnRetard: number;
}

/**
 * Tableau de bord de la liste des commerciaux : dernier 1:1, ancienneté, actions en cours.
 * Fonction pure — les données sont chargées par l'appelant.
 */
export function construireSuivi(
  commerciaux: Commercial[],
  entretiens: OneOnOne[],
  actions: Action[],
  today: string,
): SuiviCommercial[] {
  return commerciaux.map((c) => {
    const siens = entretiens
      .filter((e) => e.commercialId === c.id)
      .sort((a, b) => b.date.localeCompare(a.date));
    const dernier = siens[0] ?? null;
    const sesActions = actions.filter((a) => a.commercialId === c.id);
    return {
      commercial: c,
      dernierEntretien: dernier,
      joursDepuisDernier: dernier ? joursEntre(dernier.date, today) : null,
      actionsOuvertes: sesActions.filter((a) => isActionOuverte(a.statut)).length,
      actionsEnRetard: sesActions.filter((a) => isEnRetard(a, today)).length,
    };
  });
}

/**
 * Actions ouvertes triées par urgence : en retard d'abord, puis par échéance croissante,
 * les actions sans échéance en dernier (elles ne sont jamais « urgentes » faute de date).
 */
export function actionsParUrgence(actions: Action[], today: string): Action[] {
  return actions
    .filter((a) => isActionOuverte(a.statut))
    .sort((a, b) => {
      const ra = isEnRetard(a, today) ? 0 : 1;
      const rb = isEnRetard(b, today) ? 0 : 1;
      if (ra !== rb) return ra - rb;
      if (!a.echeance && !b.echeance) return a.createdAt.localeCompare(b.createdAt);
      if (!a.echeance) return 1;
      if (!b.echeance) return -1;
      return a.echeance.localeCompare(b.echeance);
    });
}

/** Regroupe des actions par semaine ISO d'échéance (clé '' pour les actions sans échéance). */
export function grouperParSemaine(actions: Action[]): Map<string, Action[]> {
  const m = new Map<string, Action[]>();
  for (const a of actions) {
    const k = a.echeance ? semaineIso(a.echeance) : '';
    const l = m.get(k);
    if (l) l.push(a);
    else m.set(k, [a]);
  }
  return m;
}

// ---------------------------------------------------------------- Utilitaires

/** Identifiant court, lisible et sans dépendance externe. */
export function nouvelId(prefixe: string): string {
  const rnd = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefixe}_${Date.now().toString(36)}${rnd}`;
}

/** Date du jour au format 'YYYY-MM-DD' (fuseau local, cohérent avec la saisie manuelle). */
export function aujourdHui(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
