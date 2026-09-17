// Couche d'accès aux données (lecture seule côté app, alimentée par import CSV).
// - DATABASE_URL défini  -> PostgreSQL (Supabase, Neon, ...).
// - sinon                -> fichier JSON local (.data/opportunities.json), amorcé en démo.
//
// Chaque espace (lib/espace.ts) a son propre import : table et CSV brut distincts. L'import
// France du DG n'écrase jamais l'import de l'agence, et inversement.
import { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { Opportunity, OpportunityInput, Etape } from './domain';
import { SEED_OPPORTUNITIES } from './seed-data';
import type { Espace } from './espace';

export interface Filters {
  pole?: string;
  commercial?: string;
  secteur?: string;
  etape?: string;
}

const USE_DB = !!process.env.DATABASE_URL;

/** Noms physiques par espace. Les noms de l'espace agence sont ceux d'origine (base existante). */
const CIBLES = {
  agence: {
    table: 'opportunities',
    rawKey: 'raw_csv',
    dataFile: path.join(process.cwd(), '.data', 'opportunities.json'),
    rawFile: path.join(process.cwd(), '.data', 'raw.csv'),
  },
  direction: {
    table: 'opportunities_direction',
    rawKey: 'raw_csv_direction',
    dataFile: path.join(process.cwd(), '.data', 'direction-opportunities.json'),
    rawFile: path.join(process.cwd(), '.data', 'direction-raw.csv'),
  },
} as const;

const g = globalThis as unknown as {
  __pool?: Pool;
  __memEspaces?: Partial<Record<Espace, Opportunity[]>>;
  __schemaReady?: Promise<void>;
};

// ---------- Backend fichier / mémoire ----------
function load(espace: Espace): Opportunity[] {
  const mem = (g.__memEspaces ??= {});
  const deja = mem[espace];
  if (deja) return deja;
  const { dataFile } = CIBLES[espace];
  try {
    if (fs.existsSync(dataFile)) {
      return (mem[espace] = JSON.parse(fs.readFileSync(dataFile, 'utf-8')) as Opportunity[]);
    }
  } catch {
    /* fichier illisible -> on repart de la démo */
  }
  // Démo uniquement pour l'espace agence : l'espace direction démarre vide.
  return (mem[espace] = espace === 'agence' ? SEED_OPPORTUNITIES.map((o) => ({ ...o })) : []);
}

function persist(espace: Espace, items: Opportunity[]) {
  const { dataFile } = CIBLES[espace];
  try {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    fs.writeFileSync(dataFile, JSON.stringify(items, null, 2), 'utf-8');
  } catch {
    /* en lecture seule (ex. serverless) : on garde au moins la version en mémoire */
  }
}

// ---------- Backend PostgreSQL ----------
function needsSsl(url: string): boolean {
  if (process.env.PGSSL === 'disable') return false;
  if (process.env.PGSSL === 'require' || process.env.PGSSL === 'no-verify') return true;
  // Connexions internes / locales : pas de SSL (ex. Railway *.railway.internal, localhost).
  if (/railway\.internal|localhost|127\.0\.0\.1|sslmode=disable/.test(url)) return false;
  return true; // hébergeurs distants (Neon, Supabase, ...) : SSL requis
}

function sslConfig(url: string): false | { rejectUnauthorized: boolean; ca?: string } {
  if (!needsSsl(url)) return false;
  // Par défaut on VÉRIFIE le certificat du serveur (protège contre le MITM).
  // - PGSSL=no-verify : opt-out explicite (certificat self-signed connu uniquement).
  // - PGSSL_CA : certificat racine personnalisé (PEM) si l'hébergeur en fournit un.
  const rejectUnauthorized = process.env.PGSSL !== 'no-verify';
  const ca = process.env.PGSSL_CA;
  return ca ? { rejectUnauthorized, ca } : { rejectUnauthorized };
}

function pool(): Pool {
  if (!g.__pool) {
    const url = process.env.DATABASE_URL ?? '';
    g.__pool = new Pool({
      connectionString: url,
      ssl: sslConfig(url),
    });
  }
  return g.__pool;
}

async function ensureSchema(): Promise<void> {
  if (!g.__schemaReady) {
    g.__schemaReady = pool()
      .query(`
        CREATE TABLE IF NOT EXISTS opportunities (
          id text PRIMARY KEY,
          nom text NOT NULL,
          client text NOT NULL DEFAULT '',
          pole text NOT NULL DEFAULT '',
          commercial text NOT NULL DEFAULT '',
          secteur text NOT NULL DEFAULT '',
          montant numeric(14,2) NOT NULL DEFAULT 0,
          probabilite integer NOT NULL DEFAULT 0,
          etape text NOT NULL DEFAULT 'BESOIN_ANALYSE',
          date_cloture_prev date,
          notes text NOT NULL DEFAULT '',
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS app_meta (key text PRIMARY KEY, value text);
        -- Colonnes utiles à l'espace direction (lib/espace.ts). ADD COLUMN IF NOT EXISTS : sans effet
        -- sur une base déjà migrée, et sans perte sur une base d'agence existante.
        ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS agence text NOT NULL DEFAULT '';
        ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS date_demarrage date;
        ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS type_besoin text NOT NULL DEFAULT '';
        -- Espace direction : même structure, table distincte.
        CREATE TABLE IF NOT EXISTS opportunities_direction (LIKE opportunities INCLUDING ALL);
      `)
      .then(() => undefined);
  }
  return g.__schemaReady;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToOpp(r: any): Opportunity {
  return {
    id: r.id,
    nom: r.nom,
    client: r.client ?? '',
    pole: r.pole ?? '',
    commercial: r.commercial ?? '',
    secteur: r.secteur ?? '',
    montant: Number(r.montant),
    probabilite: Number(r.probabilite),
    etape: r.etape as Etape,
    dateCloturePrev: r.date_cloture_prev ? new Date(r.date_cloture_prev).toISOString().slice(0, 10) : null,
    agence: r.agence ?? '',
    dateDemarrage: r.date_demarrage ? new Date(r.date_demarrage).toISOString().slice(0, 10) : null,
    typeBesoin: r.type_besoin ?? '',
    notes: r.notes ?? '',
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

function applyFilters(opps: Opportunity[], f?: Filters): Opportunity[] {
  if (!f) return opps;
  return opps.filter(
    (o) =>
      (!f.pole || o.pole === f.pole) &&
      (!f.commercial || o.commercial === f.commercial) &&
      (!f.secteur || o.secteur === f.secteur) &&
      (!f.etape || o.etape === f.etape),
  );
}

// ---------- API publique ----------
export async function listOpportunities(espace: Espace, f?: Filters): Promise<Opportunity[]> {
  if (USE_DB) {
    await ensureSchema();
    const { rows } = await pool().query(`SELECT * FROM ${CIBLES[espace].table} ORDER BY montant DESC`);
    return applyFilters(rows.map(rowToOpp), f);
  }
  const all = [...load(espace)].sort((a, b) => b.montant - a.montant);
  return applyFilters(all, f);
}

export async function getOpportunity(espace: Espace, id: string): Promise<Opportunity | null> {
  if (USE_DB) {
    await ensureSchema();
    const { rows } = await pool().query(`SELECT * FROM ${CIBLES[espace].table} WHERE id = $1`, [id]);
    return rows[0] ? rowToOpp(rows[0]) : null;
  }
  return load(espace).find((o) => o.id === id) ?? null;
}

/** Remplace l'intégralité des opportunités (import « remplace tout »). */
export async function replaceAll(espace: Espace, items: OpportunityInput[]): Promise<number> {
  const table = CIBLES[espace].table;
  if (USE_DB) {
    await ensureSchema();
    const client = await pool().connect();
    try {
      await client.query('BEGIN');
      await client.query(`TRUNCATE ${table}`);
      for (const o of items) {
        await client.query(
          `INSERT INTO ${table} (id, nom, client, pole, commercial, secteur, montant, probabilite, etape, date_cloture_prev, notes, agence, date_demarrage, type_besoin)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [o.id, o.nom, o.client, o.pole, o.commercial, o.secteur, o.montant, o.probabilite, o.etape, o.dateCloturePrev, o.notes, o.agence ?? '', o.dateDemarrage ?? null, o.typeBesoin ?? ''],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    return items.length;
  }
  const now = new Date().toISOString();
  const mem = (g.__memEspaces ??= {});
  const liste = (mem[espace] = items.map((o) => ({ ...o, createdAt: now, updatedAt: now })));
  persist(espace, liste);
  return liste.length;
}

/** Conserve le CSV brut du dernier import (pour le dashboard détaillé). */
export async function saveRawCsv(espace: Espace, text: string): Promise<void> {
  const { rawKey, rawFile } = CIBLES[espace];
  if (USE_DB) {
    await ensureSchema();
    await pool().query(
      `INSERT INTO app_meta(key, value) VALUES($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      [rawKey, text],
    );
    return;
  }
  try {
    fs.mkdirSync(path.dirname(rawFile), { recursive: true });
    fs.writeFileSync(rawFile, text, 'utf-8');
  } catch {
    /* ignore */
  }
}

export async function getRawCsv(espace: Espace): Promise<string | null> {
  const { rawKey, rawFile } = CIBLES[espace];
  if (USE_DB) {
    await ensureSchema();
    const { rows } = await pool().query(`SELECT value FROM app_meta WHERE key = $1`, [rawKey]);
    return rows[0]?.value ?? null;
  }
  try {
    if (fs.existsSync(rawFile)) return fs.readFileSync(rawFile, 'utf-8');
  } catch {
    /* ignore */
  }
  return null;
}

export function backendName(): string {
  return USE_DB ? 'PostgreSQL' : 'fichier local';
}
