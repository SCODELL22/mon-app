// Contrôle d'accès du module 1:1.
//
// Le reste de l'app n'a pas de rôles : « tout le monde voit les mêmes données une fois connecté »
// (cf. SETUP.md). Ce module ne peut PAS s'en contenter — il contient des appréciations
// individuelles et des sujets RH. Les rôles définis ici s'appliquent donc uniquement à /1-1.
//
// Deux rôles :
//   - MANAGER    : voit et écrit tout, y compris la zone privée.
//   - COMMERCIAL : voit UNIQUEMENT ses propres entretiens, zone partagée seulement, en lecture.
//   - (aucun)    : pas d'accès au module. Le lien n'apparaît pas.
//
// Principe FAIL-CLOSED : en cas de doute (variable non configurée, session illisible), on refuse.
// Un module de suivi RH qui s'ouvre par défaut est un incident, pas un désagrément.
import { cookies } from 'next/headers';
import { verifySession, SESSION_COOKIE, type SessionPayload } from './auth';
import { getCommercialParEmail } from './one-on-one-store';
import { visiblePour, type Commercial, type OneOnOne } from './one-on-one';

export type Role = 'MANAGER' | 'COMMERCIAL' | 'AUCUN';

export interface Acces {
  role: Role;
  email: string;
  uid: string;
  /** Renseigné uniquement si role === 'COMMERCIAL' : la fiche du commercial connecté. */
  commercial: Commercial | null;
  estManager: boolean;
}

export const ACCES_REFUSE: Acces = {
  role: 'AUCUN',
  email: '',
  uid: '',
  commercial: null,
  estManager: false,
};

/**
 * Liste des managers, via la variable d'environnement MANAGER_EMAILS (emails séparés par des
 * virgules). Non définie = aucun manager = module inaccessible en écriture. C'est volontaire :
 * mieux vaut un module inutilisable qu'un module ouvert à tout compte @ippon.fr.
 */
function managerEmails(): string[] {
  return (process.env.MANAGER_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function estEmailManager(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (!e) return false;
  return managerEmails().includes(e);
}

/**
 * Session courante lue depuis le cookie.
 *
 * Cas du développement local : proxy.ts désactive l'authentification quand AUTH_SECRET n'est pas
 * défini. On reste cohérent ici en simulant un manager local — SANS jamais le faire dès que
 * AUTH_SECRET existe, et jamais en production (NODE_ENV === 'production' impose AUTH_SECRET, cf.
 * proxy.ts qui renvoie 503 sinon).
 */
async function sessionCourante(): Promise<SessionPayload | null> {
  if (!process.env.AUTH_SECRET) {
    if (process.env.NODE_ENV === 'production') return null; // ceinture et bretelles
    return { uid: 'dev', email: 'dev@local', exp: Number.MAX_SAFE_INTEGER };
  }
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

/**
 * Détermine le rôle de l'utilisateur courant pour le module 1:1.
 * À appeler en tête de CHAQUE page et de CHAQUE route API du module — il n'y a pas de garde
 * globale : proxy.ts vérifie qu'on est connecté, pas qu'on a le droit de lire ces données.
 */
export async function acces(): Promise<Acces> {
  const session = await sessionCourante();
  if (!session) return ACCES_REFUSE;

  const email = session.email.toLowerCase();

  // En dev sans AUTH_SECRET, on donne la main pour pouvoir travailler localement.
  if (!process.env.AUTH_SECRET && process.env.NODE_ENV !== 'production') {
    return { role: 'MANAGER', email, uid: session.uid, commercial: null, estManager: true };
  }

  if (estEmailManager(email)) {
    return { role: 'MANAGER', email, uid: session.uid, commercial: null, estManager: true };
  }

  // Pas manager : accès seulement si le compte correspond à un commercial suivi.
  const commercial = await getCommercialParEmail(email);
  if (commercial && commercial.actif) {
    return { role: 'COMMERCIAL', email, uid: session.uid, commercial, estManager: false };
  }

  return { ...ACCES_REFUSE, email, uid: session.uid };
}

// ---------------------------------------------------------------- Gardes

/** Vrai si l'utilisateur a le droit d'ouvrir le module (à quelque titre que ce soit). */
export function peutAccederAuModule(a: Acces): boolean {
  return a.role !== 'AUCUN';
}

/** Seul un manager écrit. Un commercial ne peut ni créer, ni modifier, ni clôturer une action. */
export function peutEcrire(a: Acces): boolean {
  return a.role === 'MANAGER';
}

/**
 * Droit d'ouvrir la FICHE d'un commercial (pipeline, historique, actions).
 * Distinct de peutLireEntretien : la fiche n'a pas de statut de partage, seuls les entretiens
 * qu'elle liste en ont un. Un commercial accède à sa fiche, jamais à celle d'un collègue.
 */
export function peutVoirCommercial(a: Acces, commercialId: string): boolean {
  if (a.role === 'MANAGER') return true;
  if (a.role === 'COMMERCIAL') return a.commercial?.id === commercialId;
  return false;
}

/**
 * Un manager lit tous les entretiens, brouillons compris ; un commercial uniquement les siens,
 * ET seulement une fois PARTAGÉS. Un brouillon qui le concerne lui reste invisible : c'est ce qui
 * permet au manager de relire et corriger avant que quoi que ce soit ne soit lisible.
 *
 * Cette fonction décide de la VISIBILITÉ de l'entretien, pas de son contenu : le filtrage du
 * contenu (zone privée) est fait par filtrerPourLecteur() ci-dessous.
 *
 * Le statut est optionnel dans la signature pour les appelants qui ne disposent que de
 * l'identifiant du commercial ; son absence est alors traitée comme un brouillon (fail-closed).
 */
export function peutLireEntretien(
  a: Acces,
  e: Pick<OneOnOne, 'commercialId'> & Partial<Pick<OneOnOne, 'statut'>>,
): boolean {
  if (a.role === 'MANAGER') return true;
  if (a.role === 'COMMERCIAL') {
    return a.commercial?.id === e.commercialId && e.statut === 'PARTAGE';
  }
  return false;
}

/**
 * Filtre une liste d'entretiens pour un lecteur donné : ne garde que ce qu'il a le droit de voir,
 * puis retire la zone privée s'il n'est pas manager.
 *
 * Toute donnée d'entretien qui part vers un client DOIT passer par ici. C'est le seul point de
 * passage vérifié par les tests (scripts/test-one-on-one.ts).
 */
export function filtrerPourLecteur<T extends OneOnOne>(items: T[], a: Acces): T[] {
  const lisibles = items.filter((e) => peutLireEntretien(a, e));
  return visiblePour(lisibles, a.estManager);
}

/**
 * Filtre des actions pour un lecteur donné.
 *
 * Piège traité ici : une action est rattachée à un entretien. Filtrer les actions sur le seul
 * `commercialId` laisserait remonter celles décidées dans un entretien encore en BROUILLON —
 * le commercial découvrirait le contenu d'un compte rendu que le manager n'a pas fini de relire.
 * On ne garde donc que les actions dont l'entretien parent est effectivement lisible.
 */
export function filtrerActionsPourLecteur<A extends { commercialId: string; oneOnOneId: string }>(
  actions: A[],
  entretiens: OneOnOne[],
  a: Acces,
): A[] {
  if (a.estManager) return actions;
  const lisibles = new Set(
    entretiens.filter((e) => peutLireEntretien(a, e)).map((e) => e.id),
  );
  return actions.filter((x) => lisibles.has(x.oneOnOneId));
}

/** Réponse JSON standard en cas de refus, pour les routes API. */
export function refus(raison: 'unauthorized' | 'forbidden' = 'forbidden'): Response {
  return Response.json(
    { error: raison },
    { status: raison === 'unauthorized' ? 401 : 403 },
  );
}
