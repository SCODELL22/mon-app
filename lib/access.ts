// Contrôle d'accès des modules de suivi (1:1 de l'agence, OTO de la direction).
//
// DEUX ESPACES, droits calculés séparément (cf. lib/espace.ts) :
//   - espace AGENCE    : rôles ci-dessous (ADMIN / MANAGER / COMMERCIAL) ;
//   - espace DIRECTION : un seul rôle, ADMIN, réservé aux emails de DG_EMAILS. Aucune fiche ne
//     donne de droit. Être ADMIN de l'agence (MANAGER_EMAILS) ne donne RIEN ici.
// Toute page ou route doit appeler acces(espace) avec l'espace des données qu'elle lit, et lire
// ces données dans le stockage du même espace.
//
// Le reste de l'app n'a pas de rôles : « tout le monde voit les mêmes données une fois connecté »
// (cf. SETUP.md). Ce module ne peut PAS s'en contenter — il contient des appréciations
// individuelles et des sujets RH. Les rôles définis ici s'appliquent donc uniquement à /1-1.
//
// Trois niveaux, cumulables pour une même personne :
//   - ADMIN      : emails listés dans MANAGER_EMAILS (direction d'agence). Voit et écrit tout,
//                  gère les fiches et le rattachement manager -> managé, télécharge la sauvegarde.
//   - MANAGER    : email renseigné comme « manager » sur au moins une fiche active. Voit et écrit
//                  les entretiens de SES managés uniquement, zone privée comprise. Rien d'autre.
//   - COMMERCIAL : email renseigné sur sa propre fiche. Lit ses entretiens PARTAGÉS, zone
//                  partagée seulement.
//   - (aucun)    : pas d'accès au module.
//
// Une même personne peut être MANAGER de son équipe ET COMMERCIAL suivi par son propre N+1 :
// elle gère ses managés, mais ne lit sur sa propre fiche que ce qu'un commercial lit — jamais
// la zone privée de son propre entretien. D'où le raisonnement PAR FICHE (gere()) plutôt que
// par rôle global dans toutes les gardes ci-dessous.
//
// Principe FAIL-CLOSED : en cas de doute (variable non configurée, session illisible), on refuse.
// Un module de suivi RH qui s'ouvre par défaut est un incident, pas un désagrément.
import { cookies } from 'next/headers';
import { verifySession, SESSION_COOKIE, type SessionPayload } from './auth';
import { getCommercialParEmail, listCommerciauxParManager } from './one-on-one-store';
import { stripPrivate, type Commercial, type OneOnOne } from './one-on-one';
import type { Espace } from './espace';

export type Role = 'ADMIN' | 'MANAGER' | 'COMMERCIAL' | 'AUCUN';

export interface Acces {
  /** Espace pour lequel ces droits ont été calculés. */
  espace: Espace;
  /** Rôle le plus élevé, pour l'affichage. Les gardes, elles, raisonnent fiche par fiche. */
  role: Role;
  email: string;
  uid: string;
  /** Fiche du compte connecté s'il est lui-même suivi (peut coexister avec MANAGER). */
  commercial: Commercial | null;
  /** Direction d'agence : périmètre illimité. */
  estAdmin: boolean;
  /** Identifiants des fiches dont ce compte est le manager direct. Vide pour un admin (inutile). */
  managesIds: string[];
  /** Vrai si le compte peut mener des 1:1 (admin, ou manager d'au moins une fiche). */
  estManager: boolean;
}

export const ACCES_REFUSE: Acces = {
  espace: 'agence',
  role: 'AUCUN',
  email: '',
  uid: '',
  commercial: null,
  estAdmin: false,
  managesIds: [],
  estManager: false,
};

/**
 * Administrateurs du module, via la variable d'environnement MANAGER_EMAILS (emails séparés par
 * des virgules). Le nom est conservé pour ne pas casser la configuration déjà en production.
 * Non définie = aucun admin. C'est volontaire : mieux vaut un module inutilisable qu'un module
 * ouvert à tout compte @ippon.fr.
 */
function adminEmails(): string[] {
  return (process.env.MANAGER_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Direction générale : emails de DG_EMAILS (séparés par des virgules). Seuls comptes admis dans
 * l'espace direction. Non définie = espace direction fermé à tous (fail-closed).
 */
function dgEmails(): string[] {
  return (process.env.DG_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function estEmailDg(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (!e) return false;
  return dgEmails().includes(e);
}

function refusPour(espace: Espace): Acces {
  return { ...ACCES_REFUSE, espace };
}

export function estEmailAdmin(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (!e) return false;
  return adminEmails().includes(e);
}

/**
 * Session courante lue depuis le cookie.
 *
 * Cas du développement local : proxy.ts désactive l'authentification quand AUTH_SECRET n'est pas
 * défini. On reste cohérent ici en simulant un admin local — SANS jamais le faire dès que
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
 * Calcule les droits d'un email donné. Séparé de acces() pour être testable sans cookie.
 */
export async function accesPourEmail(espace: Espace, email: string, uid: string): Promise<Acces> {
  const e = email.trim().toLowerCase();
  if (!e) return refusPour(espace);

  if (espace === 'direction') {
    // Espace direction : la liste DG_EMAILS, et rien d'autre. Aucune fiche n'est consultée.
    if (!estEmailDg(e)) return refusPour('direction');
    return {
      espace: 'direction',
      role: 'ADMIN',
      email: e,
      uid,
      commercial: null,
      estAdmin: true,
      managesIds: [],
      estManager: true,
    };
  }

  if (estEmailAdmin(e)) {
    return {
      espace: 'agence',
      role: 'ADMIN',
      email: e,
      uid,
      commercial: null,
      estAdmin: true,
      managesIds: [],
      estManager: true,
    };
  }

  const [ficheBrute, equipe] = await Promise.all([
    getCommercialParEmail('agence', e),
    listCommerciauxParManager('agence', e),
  ]);
  const commercial = ficheBrute && ficheBrute.actif ? ficheBrute : null;
  // Garde-fou : une fiche dont on serait à la fois le titulaire et le manager ne donne JAMAIS
  // accès à sa propre zone privée. Le formulaire l'interdit déjà ; on ne s'y fie pas.
  const managesIds = equipe.map((c) => c.id).filter((id) => id !== ficheBrute?.id);

  const role: Role = managesIds.length ? 'MANAGER' : commercial ? 'COMMERCIAL' : 'AUCUN';
  return {
    espace: 'agence',
    role,
    email: e,
    uid,
    commercial,
    estAdmin: false,
    managesIds,
    estManager: managesIds.length > 0,
  };
}

/**
 * Détermine les droits de l'utilisateur courant sur un espace.
 * À appeler en tête de CHAQUE page et de CHAQUE route API des modules de suivi — il n'y a pas de
 * garde globale : proxy.ts vérifie qu'on est connecté, pas qu'on a le droit de lire ces données.
 */
export async function acces(espace: Espace): Promise<Acces> {
  const session = await sessionCourante();
  if (!session) return refusPour(espace);

  // En dev sans AUTH_SECRET, on donne la main pour pouvoir travailler localement.
  if (!process.env.AUTH_SECRET && process.env.NODE_ENV !== 'production') {
    return {
      espace,
      role: 'ADMIN',
      email: session.email.toLowerCase(),
      uid: session.uid,
      commercial: null,
      estAdmin: true,
      managesIds: [],
      estManager: true,
    };
  }

  return accesPourEmail(espace, session.email, session.uid);
}

// ---------------------------------------------------------------- Gardes

/** Vrai si l'utilisateur a le droit d'ouvrir le module (à quelque titre que ce soit). */
export function peutAccederAuModule(a: Acces): boolean {
  return a.role !== 'AUCUN';
}

/**
 * Accès aux écrans de saisie (nouveau 1:1). Ne suffit JAMAIS seul : toute écriture doit aussi
 * passer par gere(a, commercialId) sur la fiche concernée.
 */
export function peutEcrire(a: Acces): boolean {
  return a.estAdmin || a.managesIds.length > 0;
}

/** Gestion des fiches, du rattachement manager et de la sauvegarde complète : admin seul. */
export function peutAdministrer(a: Acces): boolean {
  return a.estAdmin;
}

/**
 * Cœur du cloisonnement : ce compte est-il responsable de CETTE fiche ?
 * Vrai = lecture de tous ses entretiens (brouillons et zone privée compris) et écriture.
 */
export function gere(a: Acces, commercialId: string): boolean {
  if (!commercialId) return false;
  if (a.estAdmin) return true;
  return a.managesIds.includes(commercialId);
}

/**
 * Droit d'ouvrir la FICHE d'un commercial (pipeline, historique, actions).
 * Un manager ouvre celles de ses managés ; un commercial la sienne ; jamais celle d'un collègue.
 */
export function peutVoirCommercial(a: Acces, commercialId: string): boolean {
  if (gere(a, commercialId)) return true;
  return !!a.commercial && a.commercial.id === commercialId;
}

/**
 * Le responsable de la fiche lit tous ses entretiens, brouillons compris ; le commercial concerné
 * uniquement les siens, ET seulement une fois PARTAGÉS. Un brouillon qui le concerne lui reste
 * invisible : c'est ce qui permet au manager de relire et corriger avant que quoi que ce soit ne
 * soit lisible.
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
  if (gere(a, e.commercialId)) return true;
  return !!a.commercial && a.commercial.id === e.commercialId && e.statut === 'PARTAGE';
}

/**
 * Filtre une liste d'entretiens pour un lecteur donné : ne garde que ce qu'il a le droit de voir,
 * puis retire la zone privée de chaque entretien dont il n'est pas responsable.
 *
 * Le retrait se fait entretien par entretien (et non « tout ou rien » selon le rôle) : un manager
 * qui est aussi suivi voit la zone privée de ses managés, jamais celle de ses propres entretiens.
 *
 * Toute donnée d'entretien qui part vers un client DOIT passer par ici. C'est le seul point de
 * passage vérifié par les tests (scripts/test-one-on-one.ts).
 */
export function filtrerPourLecteur<T extends OneOnOne>(items: T[], a: Acces): T[] {
  return items
    .filter((e) => peutLireEntretien(a, e))
    .map((e) => (gere(a, e.commercialId) ? e : stripPrivate(e)));
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
  if (a.estAdmin) return actions;
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
