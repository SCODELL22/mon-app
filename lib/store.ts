// Couche d'accès aux données (lecture seule côté app, alimentée par import CSV).
// - DATABASE_URL défini  -> PostgreSQL (Supabase, Neon, ...).
// - sinon                -> fichier JSON local (.data/opportunities.json), amorcé en démo.
import { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { Opportunity, OpportunityInput, Etape } from './domain';
import { SEED_OPPORTUNITIES } from './seed-data';
import { Snapshot, SnapshotMeta, metaOf } from './snapshots';

export interface Filters {
  pole?: string;
  commercial?: string;
  secteur?: string;
  etape?: string;
}

const USE_DB = !!process.env.DATABASE_URL;
const DATA_FILE = path.join(process.cwd(), '.data', 'opportunities.json');
const RAW_FILE = path.join(process.cwd(), '.data', 'raw.csv');
const SNAP_DIR = path.join(process.cwd(), '.data', 'snapshots');

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
  if (process.env.PGSSL === 'require') return true;
  // Connexions internes / locales : pas de SSL (ex. Railway *.railway.internal, localhost).
  if (/railway\.internal|localhost|127\.0\.0\.1|sslmode=disable/.test(url)) return false;
  return true; // hébergeurs distants (Neon, Supabase, ...) : SSL requis
}

function pool(): Pool {
  if (!g.__pool) {
    const url = process.env.DATABASE_URL ?? '';
    g.__pool = new Pool({
      connectionString: url,
      ssl: needsSsl(url) ? { rejectUnauthorized: false } : false,
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
        CREATE TABLE IF NOT EXISTS snapshots (
          id text PRIMARY KEY,
          taken_at timestamptz NOT NULL,
          count integer NOT NULL DEFAULT 0,
          ouvertes integer NOT NULL DEFAULT 0,
          brut numeric(14,2) NOT NULL DEFAULT 0,
          pondere numeric(14,2) NOT NULL DEFAULT 0,
          gagne numeric(14,2) NOT NULL DEFAULT 0,
          perdu numeric(14,2) NOT NULL DEFAULT 0,
          payload jsonb NOT NULL
        );
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

// ---------- Historique des imports (snapshots) ----------
function snapToRow(r: any): SnapshotMeta {
  return {
    id: r.id,
    takenAt: new Date(r.taken_at).toISOString(),
    count: Number(r.count),
    ouvertes: Number(r.ouvertes),
    brut: Number(r.brut),
    pondere: Number(r.pondere),
    gagne: Number(r.gagne),
    perdu: Number(r.perdu),
  };
}

/** Enregistre un snapshot daté de l'état importé. */
export async function saveSnapshot(snap: Snapshot): Promise<void> {
  if (USE_DB) {
    await ensureSchema();
    await pool().query(
      `INSERT INTO snapshots (id, taken_at, count, ouvertes, brut, pondere, gagne, perdu, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO NOTHING`,
      [
        snap.id,
        snap.takenAt,
        snap.count,
        snap.ouvertes,
        snap.brut,
        snap.pondere,
        snap.gagne,
        snap.perdu,
        JSON.stringify({ opportunities: snap.opportunities }),
      ],
    );
    return;
  }
  try {
    fs.mkdirSync(SNAP_DIR, { recursive: true });
    fs.writeFileSync(path.join(SNAP_DIR, `${snap.id}.json`), JSON.stringify(snap), 'utf-8');
  } catch {
    /* lecture seule : on n'historise pas, sans bloquer l'import */
  }
}

/** Liste les métadonnées des snapshots, du plus ancien au plus récent. */
export async function listSnapshotMetas(): Promise<SnapshotMeta[]> {
  if (USE_DB) {
    await ensureSchema();
    const { rows } = await pool().query(
      'SELECT id, taken_at, count, ouvertes, brut, pondere, gagne, perdu FROM snapshots ORDER BY taken_at ASC',
    );
    return rows.map(snapToRow);
  }
  try {
    if (!fs.existsSync(SNAP_DIR)) return [];
    const metas = fs
      .readdirSync(SNAP_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const snap = JSON.parse(fs.readFileSync(path.join(SNAP_DIR, f), 'utf-8')) as Snapshot;
        return metaOf(snap);
      });
    return metas.sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  } catch {
    return [];
  }
}

/** Charge un snapshot complet (avec le détail des opportunités). */
export async function getSnapshot(id: string): Promise<Snapshot | null> {
  if (USE_DB) {
    await ensureSchema();
    const { rows } = await pool().query('SELECT * FROM snapshots WHERE id = $1', [id]);
    if (!rows[0]) return null;
    const meta = snapToRow(rows[0]);
    const payload = rows[0].payload as { opportunities: Opportunity[] };
    return { ...meta, opportunities: payload?.opportunities ?? [] };
  }
  try {
    const file = path.join(SNAP_DIR, `${id}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as Snapshot;
  } catch {
    return null;
  }
}

export function backendName(): string {
  return USE_DB ? 'PostgreSQL' : 'fichier local';
}
