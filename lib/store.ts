// Couche d'accès aux données (lecture seule côté app, alimentée par import CSV).
// - DATABASE_URL défini  -> PostgreSQL (Supabase, Neon, ...).
// - sinon                -> fichier JSON local (.data/opportunities.json), amorcé en démo.
import { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { Opportunity, OpportunityInput, Etape } from './domain';
import { SEED_OPPORTUNITIES } from './seed-data';

export interface Filters {
  pole?: string;
  commercial?: string;
  secteur?: string;
  etape?: string;
}

const USE_DB = !!process.env.DATABASE_URL;
const DATA_FILE = path.join(process.cwd(), '.data', 'opportunities.json');
const RAW_FILE = path.join(process.cwd(), '.data', 'raw.csv');

const g = globalThis as unknown as {
  __pool?: Pool;
  __mem?: Opportunity[];
  __schemaReady?: Promise<void>;
};

// ---------- Backend fichier / mémoire ----------
function load(): Opportunity[] {
  if (g.__mem) return g.__mem;
  try {
    if (fs.existsSync(DATA_FILE)) {
      g.__mem = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as Opportunity[];
      return g.__mem;
    }
  } catch {
    /* fichier illisible -> on repart de la démo */
  }
  g.__mem = SEED_OPPORTUNITIES.map((o) => ({ ...o }));
  return g.__mem;
}

function persist(items: Opportunity[]) {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), 'utf-8');
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
export async function listOpportunities(f?: Filters): Promise<Opportunity[]> {
  if (USE_DB) {
    await ensureSchema();
    const { rows } = await pool().query('SELECT * FROM opportunities ORDER BY montant DESC');
    return applyFilters(rows.map(rowToOpp), f);
  }
  const all = [...load()].sort((a, b) => b.montant - a.montant);
  return applyFilters(all, f);
}

export async function getOpportunity(id: string): Promise<Opportunity | null> {
  if (USE_DB) {
    await ensureSchema();
    const { rows } = await pool().query('SELECT * FROM opportunities WHERE id = $1', [id]);
    return rows[0] ? rowToOpp(rows[0]) : null;
  }
  return load().find((o) => o.id === id) ?? null;
}

/** Remplace l'intégralité des opportunités (import « remplace tout »). */
export async function replaceAll(items: OpportunityInput[]): Promise<number> {
  if (USE_DB) {
    await ensureSchema();
    const client = await pool().connect();
    try {
      await client.query('BEGIN');
      await client.query('TRUNCATE opportunities');
      for (const o of items) {
        await client.query(
          `INSERT INTO opportunities (id, nom, client, pole, commercial, secteur, montant, probabilite, etape, date_cloture_prev, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [o.id, o.nom, o.client, o.pole, o.commercial, o.secteur, o.montant, o.probabilite, o.etape, o.dateCloturePrev, o.notes],
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
  g.__mem = items.map((o) => ({ ...o, createdAt: now, updatedAt: now }));
  persist(g.__mem);
  return g.__mem.length;
}

/** Conserve le CSV brut du dernier import (pour le dashboard détaillé). */
export async function saveRawCsv(text: string): Promise<void> {
  if (USE_DB) {
    await ensureSchema();
    await pool().query(
      `INSERT INTO app_meta(key, value) VALUES('raw_csv', $1)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      [text],
    );
    return;
  }
  try {
    fs.mkdirSync(path.dirname(RAW_FILE), { recursive: true });
    fs.writeFileSync(RAW_FILE, text, 'utf-8');
  } catch {
    /* ignore */
  }
}

export async function getRawCsv(): Promise<string | null> {
  if (USE_DB) {
    await ensureSchema();
    const { rows } = await pool().query(`SELECT value FROM app_meta WHERE key = 'raw_csv'`);
    return rows[0]?.value ?? null;
  }
  try {
    if (fs.existsSync(RAW_FILE)) return fs.readFileSync(RAW_FILE, 'utf-8');
  } catch {
    /* ignore */
  }
  return null;
}

export function backendName(): string {
  return USE_DB ? 'PostgreSQL' : 'fichier local';
}
