// Comptes utilisateurs (email + mot de passe haché). Même pattern dual-backend que lib/store.ts :
// PostgreSQL si DATABASE_URL est défini, sinon fichier JSON local (.data/users.json).
import { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

const USE_DB = !!process.env.DATABASE_URL;
const USERS_FILE = path.join(process.cwd(), '.data', 'users.json');

const g = globalThis as unknown as {
  __authPool?: Pool;
  __users?: User[];
  __authSchemaReady?: Promise<void>;
};

// ---------- Connexion Postgres (config identique à lib/store.ts) ----------
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
  if (!g.__authPool) {
    const url = process.env.DATABASE_URL ?? '';
    g.__authPool = new Pool({ connectionString: url, ssl: sslConfig(url) });
  }
  return g.__authPool;
}
async function ensureSchema(): Promise<void> {
  if (!g.__authSchemaReady) {
    g.__authSchemaReady = pool()
      .query(
        `CREATE TABLE IF NOT EXISTS users (
          id text PRIMARY KEY,
          email text UNIQUE NOT NULL,
          password_hash text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        );`,
      )
      .then(() => undefined);
  }
  return g.__authSchemaReady;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToUser(r: any): User {
  return {
    id: r.id,
    email: r.email,
    passwordHash: r.password_hash,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

// ---------- Backend fichier local ----------
function loadLocal(): User[] {
  if (g.__users) return g.__users;
  try {
    if (fs.existsSync(USERS_FILE)) {
      g.__users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')) as User[];
      return g.__users;
    }
  } catch {
    /* fichier illisible -> on repart vide */
  }
  g.__users = [];
  return g.__users;
}
function persistLocal(users: User[]) {
  try {
    fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
  } catch {
    /* lecture seule : on garde au moins la version en mémoire */
  }
}

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ---------- API publique ----------
export async function getUserByEmail(email: string): Promise<User | null> {
  const e = normEmail(email);
  if (USE_DB) {
    await ensureSchema();
    const { rows } = await pool().query(
      'SELECT id, email, password_hash, created_at FROM users WHERE email = $1',
      [e],
    );
    return rows[0] ? rowToUser(rows[0]) : null;
  }
  return loadLocal().find((u) => u.email === e) ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  if (USE_DB) {
    await ensureSchema();
    const { rows } = await pool().query(
      'SELECT id, email, password_hash, created_at FROM users WHERE id = $1',
      [id],
    );
    return rows[0] ? rowToUser(rows[0]) : null;
  }
  return loadLocal().find((u) => u.id === id) ?? null;
}

/** Crée un compte. Lève une erreur EMAIL_TAKEN si l'email est déjà utilisé. */
export async function createUser(email: string, passwordHash: string): Promise<User> {
  const e = normEmail(email);
  if (await getUserByEmail(e)) throw new Error('EMAIL_TAKEN');
  const user: User = { id: crypto.randomUUID(), email: e, passwordHash, createdAt: new Date().toISOString() };
  if (USE_DB) {
    await ensureSchema();
    await pool().query('INSERT INTO users (id, email, password_hash, created_at) VALUES ($1,$2,$3,$4)', [
      user.id,
      user.email,
      user.passwordHash,
      user.createdAt,
    ]);
    return user;
  }
  const users = loadLocal();
  users.push(user);
  persistLocal(users);
  return user;
}

/** Change le mot de passe (déjà haché) d'un utilisateur existant. Ne fait rien si l'id est inconnu. */
export async function updatePassword(id: string, passwordHash: string): Promise<void> {
  if (USE_DB) {
    await ensureSchema();
    await pool().query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
    return;
  }
  const users = loadLocal();
  const user = users.find((u) => u.id === id);
  if (user) {
    user.passwordHash = passwordHash;
    persistLocal(users);
  }
}

export function usersBackendName(): string {
  return USE_DB ? 'PostgreSQL' : 'fichier local';
}
