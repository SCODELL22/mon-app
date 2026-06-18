// Amorce la base PostgreSQL avec les données de démonstration.
// Usage : DATABASE_URL=... npx tsx scripts/seed-db.ts [--force]
import { Pool } from 'pg';
import { SEED_OPPORTUNITIES } from '../lib/seed-data';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL non défini. Renseignez-le pour amorcer une base PostgreSQL.');
    process.exit(1);
  }
  const force = process.argv.includes('--force');
  const pool = new Pool({
    connectionString: url,
    ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS opportunities (
      id text PRIMARY KEY,
      nom text NOT NULL,
      client text NOT NULL DEFAULT '',
      pole text NOT NULL DEFAULT '',
      commercial text NOT NULL DEFAULT '',
      secteur text NOT NULL DEFAULT '',
      montant numeric(14,2) NOT NULL DEFAULT 0,
      probabilite integer NOT NULL DEFAULT 0,
      etape text NOT NULL DEFAULT 'IDENTIFIE',
      date_cloture_prev date,
      notes text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const { rows } = await pool.query('SELECT count(*)::int AS n FROM opportunities');
  if (rows[0].n > 0 && !force) {
    console.log(`La table contient déjà ${rows[0].n} lignes. Utilisez --force pour réinitialiser.`);
    await pool.end();
    return;
  }
  if (force) await pool.query('TRUNCATE opportunities');

  for (const o of SEED_OPPORTUNITIES) {
    await pool.query(
      `INSERT INTO opportunities (id, nom, client, pole, commercial, secteur, montant, probabilite, etape, date_cloture_prev, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [o.id, o.nom, o.client, o.pole, o.commercial, o.secteur, o.montant, o.probabilite, o.etape, o.dateCloturePrev, o.notes],
    );
  }
  console.log(`✅ ${SEED_OPPORTUNITIES.length} opportunités insérées.`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
