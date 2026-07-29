// Stockage du suivi 1:1 — même pattern dual-backend que lib/store.ts et lib/users.ts :
//   DATABASE_URL défini -> PostgreSQL ; sinon -> fichiers JSON locaux dans .data/.
//
// ATTENTION — différence majeure avec lib/store.ts : ces données sont la SOURCE DE VÉRITÉ.
// Les opportunités viennent de BoondManager et peuvent être réimportées ; un 1:1 perdu est perdu.
// D'où : pas de TRUNCATE, écritures unitaires, et sauvegarde recommandée (cf. exportTout()).
import { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import {
  Action,
  ActionInput,
  Commercial,
  CommercialInput,
  OneOnOne,
  OneOnOneInput,
  StatutEntretien,
  Chiffres,
  ZonePartagee,
  ZoneManager,
  Humeur,
  CHIFFRES_VIDES,
  ZONE_PARTAGEE_VIDE,
} from './one-on-one';

const USE_DB = !!process.env.DATABASE_URL;
const DIR = path.join(process.cwd(), '.data');
const F_COMMERCIAUX = path.join(DIR, 'commerciaux.json');
const F_ENTRETIENS = path.join(DIR, 'one-on-ones.json');
const F_ACTIONS = path.join(DIR, 'one-on-one-actions.json');

const g = globalThis as unknown as {
  __o3Pool?: Pool;
  __o3Commerciaux?: Commercial[];
  __o3Entretiens?: OneOnOne[];
  __o3Actions?: Action[];
  __o3SchemaReady?: Promise<void>;
};

// ---------------------------------------------------------------- Postgres
// Configuration SSL identique à lib/store.ts — dupliquée volontairement pour ne pas modifier
// un fichier déjà en production. À factoriser le jour où un 4e module en aura besoin.
function needsSsl(url: string): boolean {
  if (process.env.PGSSL === 'disable') return false;
  if (process.env.PGSSL === 'require' || process.env.PGSSL === 'no-verify') return true;
  if (/railway\.internal|localhost|127\.0\.0\.1|sslmode=disable/.test(url)) return false;
  return true;
}
function sslConfig(url: string): false | { rejectUnauthorized: boolean; ca?: string } {
  if (!needsSsl(url)) return false;
  const rejectUnauthorized = process.env.PGSSL !== 'no-verify';
  const ca = process.env.PGSSL_CA;
  return ca ? { rejectUnauthorized, ca } : { rejectUnauthorized };
}
function pool(): Pool {
  if (!g.__o3Pool) {
    const url = process.env.DATABASE_URL ?? '';
    g.__o3Pool = new Pool({ connectionString: url, ssl: sslConfig(url) });
  }
  return g.__o3Pool;
}

async function ensureSchema(): Promise<void> {
  if (!g.__o3SchemaReady) {
    g.__o3SchemaReady = pool()
      .query(`
        CREATE TABLE IF NOT EXISTS commerciaux (
          id text PRIMARY KEY,
          nom text NOT NULL,
          libelle_boond text NOT NULL DEFAULT '',
          email text NOT NULL DEFAULT '',
          pole text NOT NULL DEFAULT '',
          objectif_annuel numeric(14,2) NOT NULL DEFAULT 0,
          actif boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS one_on_ones (
          id text PRIMARY KEY,
          commercial_id text NOT NULL REFERENCES commerciaux(id) ON DELETE CASCADE,
          date date NOT NULL,
          auteur_email text NOT NULL DEFAULT '',
          -- Cycle de vie : BROUILLON tant que le manager n'a pas explicitement partagé.
          statut text NOT NULL DEFAULT 'BROUILLON',
          partage_le timestamptz,
          -- Chiffres et zones stockés en jsonb : le contenu de la trame évoluera plus vite que
          -- le schéma, et ces champs ne sont jamais requêtés colonne par colonne.
          chiffres jsonb NOT NULL DEFAULT '{}'::jsonb,
          partage jsonb NOT NULL DEFAULT '{}'::jsonb,
          -- Zone privée manager : NULL tant que rien n'est saisi.
          prive jsonb,
          notes_brutes text NOT NULL DEFAULT '',
          -- Verbatim Google Meet. Donnée privée la plus sensible du module.
          transcription text NOT NULL DEFAULT '',
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS one_on_ones_commercial_idx ON one_on_ones (commercial_id, date DESC);

        CREATE TABLE IF NOT EXISTS one_on_one_actions (
          id text PRIMARY KEY,
          one_on_one_id text NOT NULL REFERENCES one_on_ones(id) ON DELETE CASCADE,
          commercial_id text NOT NULL,
          libelle text NOT NULL,
          porteur text NOT NULL DEFAULT 'COMMERCIAL',
          echeance date,
          statut text NOT NULL DEFAULT 'OUVERTE',
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          closed_at timestamptz
        );
        CREATE INDEX IF NOT EXISTS actions_commercial_idx ON one_on_one_actions (commercial_id, statut);

        -- Migrations pour les bases créées avant l'introduction d'une colonne.
        -- CREATE TABLE IF NOT EXISTS ne touche pas une table existante : sans ces ALTER, une base
        -- déjà en service resterait sur l'ancien schéma et les requêtes échoueraient.
        -- Le défaut BROUILLON est volontaire : les entretiens saisis avant cette migration ne
        -- deviennent PAS visibles des commerciaux du jour au lendemain.
        ALTER TABLE one_on_ones ADD COLUMN IF NOT EXISTS statut text NOT NULL DEFAULT 'BROUILLON';
        ALTER TABLE one_on_ones ADD COLUMN IF NOT EXISTS partage_le timestamptz;
        ALTER TABLE one_on_ones ADD COLUMN IF NOT EXISTS transcription text NOT NULL DEFAULT '';
      `)
      .then(() => undefined);
  }
  return g.__o3SchemaReady;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function jour(v: any): string {
  // Postgres renvoie un Date pour les colonnes `date` ; le backend fichier une chaîne.
  if (!v) return '';
  return typeof v === 'string' ? v.slice(0, 10) : new Date(v).toISOString().slice(0, 10);
}

function rowToCommercial(r: any): Commercial {
  return {
    id: r.id,
    nom: r.nom,
    libelleBoond: r.libelle_boond ?? '',
    email: (r.email ?? '').toLowerCase(),
    pole: r.pole ?? '',
    objectifAnnuel: Number(r.objectif_annuel ?? 0),
    actif: r.actif !== false,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

function normChiffres(v: any): Chiffres {
  const o = v ?? {};
  return {
    caSigne: Number(o.caSigne ?? 0),
    pipelinePondere: Number(o.pipelinePondere ?? 0),
    nbRdv: Number(o.nbRdv ?? 0),
    nbNouveauxComptes: Number(o.nbNouveauxComptes ?? 0),
  };
}
function normPartage(v: any): ZonePartagee {
  const o = v ?? {};
  return {
    pipelineCommentaire: String(o.pipelineCommentaire ?? ''),
    dealsARisque: String(o.dealsARisque ?? ''),
    activiteAmont: String(o.activiteAmont ?? ''),
    administratif: String(o.administratif ?? ''),
    developpement: String(o.developpement ?? ''),
    pointsCles: String(o.pointsCles ?? ''),
  };
}
function normPrive(v: any): ZoneManager | null {
  if (!v) return null;
  const h = Number(v.humeur);
  return {
    moral: String(v.moral ?? ''),
    humeur: h >= 1 && h <= 5 ? ((h | 0) as Humeur) : null,
    notesRh: String(v.notesRh ?? ''),
  };
}

function rowToOneOnOne(r: any): OneOnOne {
  return {
    id: r.id,
    commercialId: r.commercial_id,
    date: jour(r.date),
    auteurEmail: (r.auteur_email ?? '').toLowerCase(),
    // Fail-closed : toute valeur inattendue (colonne absente, donnée d'un ancien format) est
    // traitée comme un brouillon. Ne jamais inverser ce défaut.
    statut: r.statut === 'PARTAGE' ? 'PARTAGE' : 'BROUILLON',
    partageLe: r.partage_le ? new Date(r.partage_le).toISOString() : null,
    chiffres: normChiffres(r.chiffres),
    partage: normPartage(r.partage),
    prive: normPrive(r.prive),
    notesBrutes: r.notes_brutes ?? '',
    transcription: r.transcription ?? '',
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

function rowToAction(r: any): Action {
  return {
    id: r.id,
    oneOnOneId: r.one_on_one_id,
    commercialId: r.commercial_id,
    libelle: r.libelle,
    porteur: r.porteur === 'MANAGER' ? 'MANAGER' : 'COMMERCIAL',
    echeance: r.echeance ? jour(r.echeance) : null,
    statut: r.statut,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
  };
}

// ---------------------------------------------------------------- Backend fichier
function readJson<T>(file: string, fallback: T): T {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    /* fichier illisible -> on repart du fallback plutôt que de planter au démarrage */
  }
  return fallback;
}
function writeJson(file: string, data: unknown): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // Système de fichiers en lecture seule (serverless) : la donnée reste en mémoire pour la
    // durée du processus. En production, DATABASE_URL doit être défini — voir SETUP.md.
  }
}

function memCommerciaux(): Commercial[] {
  return (g.__o3Commerciaux ??= readJson<Commercial[]>(F_COMMERCIAUX, []));
}
function memEntretiens(): OneOnOne[] {
  // Normalisation à la lecture : les fichiers écrits avant l'introduction du statut n'ont pas le
  // champ. Même règle fail-closed que côté Postgres — tout ce qui n'est pas explicitement
  // 'PARTAGE' est un brouillon, donc invisible du commercial.
  return (g.__o3Entretiens ??= readJson<OneOnOne[]>(F_ENTRETIENS, []).map((e) => ({
    ...e,
    statut: e.statut === 'PARTAGE' ? 'PARTAGE' : 'BROUILLON',
    partageLe: e.statut === 'PARTAGE' ? (e.partageLe ?? null) : null,
    transcription: e.transcription ?? '',
  })));
}
function memActions(): Action[] {
  return (g.__o3Actions ??= readJson<Action[]>(F_ACTIONS, []));
}

// ================================================================ Commerciaux

export async function listCommerciaux(inclureInactifs = false): Promise<Commercial[]> {
  let all: Commercial[];
  if (USE_DB) {
    await ensureSchema();
    const { rows } = await pool().query('SELECT * FROM commerciaux ORDER BY nom');
    all = rows.map(rowToCommercial);
  } else {
    all = [...memCommerciaux()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }
  return inclureInactifs ? all : all.filter((c) => c.actif);
}

export async function getCommercial(id: string): Promise<Commercial | null> {
  if (USE_DB) {
    await ensureSchema();
    const { rows } = await pool().query('SELECT * FROM commerciaux WHERE id = $1', [id]);
    return rows[0] ? rowToCommercial(rows[0]) : null;
  }
  return memCommerciaux().find((c) => c.id === id) ?? null;
}

/** Retrouve le commercial rattaché à un compte applicatif. Comparaison insensible à la casse. */
export async function getCommercialParEmail(email: string): Promise<Commercial | null> {
  const e = email.trim().toLowerCase();
  if (!e) return null;
  if (USE_DB) {
    await ensureSchema();
    const { rows } = await pool().query('SELECT * FROM commerciaux WHERE lower(email) = $1', [e]);
    return rows[0] ? rowToCommercial(rows[0]) : null;
  }
  return memCommerciaux().find((c) => c.email.toLowerCase() === e) ?? null;
}

export async function upsertCommercial(c: CommercialInput): Promise<Commercial> {
  const now = new Date().toISOString();
  if (USE_DB) {
    await ensureSchema();
    const { rows } = await pool().query(
      `INSERT INTO commerciaux (id, nom, libelle_boond, email, pole, objectif_annuel, actif)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET
         nom = excluded.nom, libelle_boond = excluded.libelle_boond, email = excluded.email,
         pole = excluded.pole, objectif_annuel = excluded.objectif_annuel,
         actif = excluded.actif, updated_at = now()
       RETURNING *`,
      [c.id, c.nom, c.libelleBoond, c.email.toLowerCase(), c.pole, c.objectifAnnuel, c.actif],
    );
    return rowToCommercial(rows[0]);
  }
  const list = memCommerciaux();
  const i = list.findIndex((x) => x.id === c.id);
  const item: Commercial = {
    ...c,
    email: c.email.toLowerCase(),
    createdAt: i >= 0 ? list[i].createdAt : now,
    updatedAt: now,
  };
  if (i >= 0) list[i] = item;
  else list.push(item);
  writeJson(F_COMMERCIAUX, list);
  return item;
}

// ================================================================ Entretiens

export async function listOneOnOnes(commercialId?: string): Promise<OneOnOne[]> {
  if (USE_DB) {
    await ensureSchema();
    const { rows } = commercialId
      ? await pool().query(
          'SELECT * FROM one_on_ones WHERE commercial_id = $1 ORDER BY date DESC, created_at DESC',
          [commercialId],
        )
      : await pool().query('SELECT * FROM one_on_ones ORDER BY date DESC, created_at DESC');
    return rows.map(rowToOneOnOne);
  }
  return memEntretiens()
    .filter((e) => !commercialId || e.commercialId === commercialId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export async function getOneOnOne(id: string): Promise<OneOnOne | null> {
  if (USE_DB) {
    await ensureSchema();
    const { rows } = await pool().query('SELECT * FROM one_on_ones WHERE id = $1', [id]);
    return rows[0] ? rowToOneOnOne(rows[0]) : null;
  }
  return memEntretiens().find((e) => e.id === id) ?? null;
}

export async function upsertOneOnOne(e: OneOnOneInput): Promise<OneOnOne> {
  const now = new Date().toISOString();
  const chiffres = { ...CHIFFRES_VIDES, ...e.chiffres };
  const partage = { ...ZONE_PARTAGEE_VIDE, ...e.partage };
  const statut: StatutEntretien = e.statut === 'PARTAGE' ? 'PARTAGE' : 'BROUILLON';
  // La date de partage est posée ici, pas par l'appelant : garantit qu'un entretien partagé a
  // toujours un horodatage, et qu'un retour en brouillon l'efface.
  const partageLe = statut === 'PARTAGE' ? (e.partageLe ?? now) : null;

  if (USE_DB) {
    await ensureSchema();
    const { rows } = await pool().query(
      `INSERT INTO one_on_ones (id, commercial_id, date, auteur_email, statut, partage_le, chiffres, partage, prive, notes_brutes, transcription)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET
         commercial_id = excluded.commercial_id, date = excluded.date,
         statut = excluded.statut, partage_le = excluded.partage_le,
         chiffres = excluded.chiffres, partage = excluded.partage, prive = excluded.prive,
         notes_brutes = excluded.notes_brutes, transcription = excluded.transcription,
         updated_at = now()
       RETURNING *`,
      [
        e.id,
        e.commercialId,
        e.date,
        e.auteurEmail.toLowerCase(),
        statut,
        partageLe,
        JSON.stringify(chiffres),
        JSON.stringify(partage),
        e.prive ? JSON.stringify(e.prive) : null,
        e.notesBrutes,
        e.transcription ?? '',
      ],
    );
    return rowToOneOnOne(rows[0]);
  }
  const list = memEntretiens();
  const i = list.findIndex((x) => x.id === e.id);
  const item: OneOnOne = {
    ...e,
    statut,
    partageLe,
    chiffres,
    partage,
    transcription: e.transcription ?? '',
    auteurEmail: e.auteurEmail.toLowerCase(),
    createdAt: i >= 0 ? list[i].createdAt : now,
    updatedAt: now,
  };
  if (i >= 0) list[i] = item;
  else list.push(item);
  writeJson(F_ENTRETIENS, list);
  return item;
}

/**
 * Bascule le statut de partage d'un entretien. Isolé du reste de l'édition : partager est un
 * geste délibéré, pas un effet de bord d'un enregistrement de formulaire.
 */
export async function definirPartage(
  id: string,
  partage: boolean,
): Promise<OneOnOne | null> {
  const e = await getOneOnOne(id);
  if (!e) return null;
  return upsertOneOnOne({
    ...e,
    statut: partage ? 'PARTAGE' : 'BROUILLON',
    partageLe: partage ? (e.partageLe ?? new Date().toISOString()) : null,
  });
}

export async function deleteOneOnOne(id: string): Promise<void> {
  if (USE_DB) {
    await ensureSchema();
    // ON DELETE CASCADE supprime les actions rattachées.
    await pool().query('DELETE FROM one_on_ones WHERE id = $1', [id]);
    return;
  }
  g.__o3Entretiens = memEntretiens().filter((e) => e.id !== id);
  g.__o3Actions = memActions().filter((a) => a.oneOnOneId !== id);
  writeJson(F_ENTRETIENS, g.__o3Entretiens);
  writeJson(F_ACTIONS, g.__o3Actions);
}

// ================================================================ Actions

export async function listActions(filtre?: {
  commercialId?: string;
  oneOnOneId?: string;
}): Promise<Action[]> {
  if (USE_DB) {
    await ensureSchema();
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filtre?.commercialId) {
      params.push(filtre.commercialId);
      clauses.push(`commercial_id = $${params.length}`);
    }
    if (filtre?.oneOnOneId) {
      params.push(filtre.oneOnOneId);
      clauses.push(`one_on_one_id = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await pool().query(
      `SELECT * FROM one_on_one_actions ${where} ORDER BY echeance NULLS LAST, created_at`,
      params,
    );
    return rows.map(rowToAction);
  }
  return memActions()
    .filter(
      (a) =>
        (!filtre?.commercialId || a.commercialId === filtre.commercialId) &&
        (!filtre?.oneOnOneId || a.oneOnOneId === filtre.oneOnOneId),
    )
    .sort((a, b) => {
      if (!a.echeance && !b.echeance) return a.createdAt.localeCompare(b.createdAt);
      if (!a.echeance) return 1;
      if (!b.echeance) return -1;
      return a.echeance.localeCompare(b.echeance) || a.createdAt.localeCompare(b.createdAt);
    });
}

export async function getAction(id: string): Promise<Action | null> {
  if (USE_DB) {
    await ensureSchema();
    const { rows } = await pool().query('SELECT * FROM one_on_one_actions WHERE id = $1', [id]);
    return rows[0] ? rowToAction(rows[0]) : null;
  }
  return memActions().find((a) => a.id === id) ?? null;
}

export async function upsertAction(a: ActionInput): Promise<Action> {
  const now = new Date().toISOString();
  // Horodatage de clôture posé ici plutôt que par l'appelant : garantit qu'une action « faite »
  // a toujours une date de clôture, et qu'une réouverture la remet à null.
  const clos = a.statut === 'FAITE' || a.statut === 'ABANDONNEE';
  if (USE_DB) {
    await ensureSchema();
    const { rows } = await pool().query(
      `INSERT INTO one_on_one_actions (id, one_on_one_id, commercial_id, libelle, porteur, echeance, statut, closed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $8 THEN now() ELSE NULL END)
       ON CONFLICT (id) DO UPDATE SET
         libelle = excluded.libelle, porteur = excluded.porteur, echeance = excluded.echeance,
         statut = excluded.statut, updated_at = now(),
         closed_at = CASE WHEN $8 THEN COALESCE(one_on_one_actions.closed_at, now()) ELSE NULL END
       RETURNING *`,
      [a.id, a.oneOnOneId, a.commercialId, a.libelle, a.porteur, a.echeance, a.statut, clos],
    );
    return rowToAction(rows[0]);
  }
  const list = memActions();
  const i = list.findIndex((x) => x.id === a.id);
  const item: Action = {
    ...a,
    createdAt: i >= 0 ? list[i].createdAt : now,
    updatedAt: now,
    closedAt: clos ? (i >= 0 ? (list[i].closedAt ?? now) : now) : null,
  };
  if (i >= 0) list[i] = item;
  else list.push(item);
  writeJson(F_ACTIONS, list);
  return item;
}

export async function deleteAction(id: string): Promise<void> {
  if (USE_DB) {
    await ensureSchema();
    await pool().query('DELETE FROM one_on_one_actions WHERE id = $1', [id]);
    return;
  }
  g.__o3Actions = memActions().filter((a) => a.id !== id);
  writeJson(F_ACTIONS, g.__o3Actions);
}

// ================================================================ Sauvegarde

/**
 * Export complet du module, à des fins de sauvegarde. Ces données n'existent nulle part ailleurs
 * (contrairement aux opportunités, réimportables depuis BoondManager) : à exporter régulièrement.
 * Contient la ZONE PRIVÉE — réservé au manager, jamais exposé sans contrôle de rôle.
 */
export async function exportTout(): Promise<{
  exporteLe: string;
  commerciaux: Commercial[];
  entretiens: OneOnOne[];
  actions: Action[];
}> {
  const [commerciaux, entretiens, actions] = await Promise.all([
    listCommerciaux(true),
    listOneOnOnes(),
    listActions(),
  ]);
  return { exporteLe: new Date().toISOString(), commerciaux, entretiens, actions };
}

export function backendName(): string {
  return USE_DB ? 'PostgreSQL' : 'fichier local';
}
