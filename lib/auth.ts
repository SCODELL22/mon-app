// Authentification par compte (email + mot de passe) — remplace l'ancienne Basic Auth partagée
// (AUTH_USER/AUTH_PASSWORD) par de vrais comptes individuels avec inscription libre.
// Aucune dépendance npm ajoutée : hachage de mot de passe (PBKDF2) et signature de session
// (HMAC-SHA256) via l'API Web Crypto, portable entre le runtime Node et Edge.
import { NextResponse } from 'next/server';

const PBKDF2_ITERATIONS = 210_000; // recommandation OWASP 2023 pour PBKDF2-HMAC-SHA256
const enc = new TextEncoder();

/**
 * Redirige avec un Location RELATIF plutôt qu'une URL absolue.
 * Derrière certains hébergeurs (Railway inclus), construire l'URL de redirection avec
 * `new URL(path, req.url)` peut résoudre l'origine sur l'adresse interne du conteneur
 * (http://localhost:8080) plutôt que sur le domaine public — le navigateur suit alors
 * un lien vers sa propre machine et tombe en ERR_CONNECTION_REFUSED. Un Location relatif
 * est toujours résolu par le navigateur contre l'URL publique qu'il a réellement appelée.
 */
export function redirectTo(path: string, status: 303 | 307 = 303): NextResponse {
  return new NextResponse(null, { status, headers: { Location: path } });
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function fromHex(hex: string): Uint8Array {
  const arr = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  return arr;
}

/** Hache un mot de passe : renvoie "sel:hash" (hex), stockable tel quel en base. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return `${toHex(salt.buffer as ArrayBuffer)}:${toHex(bits)}`;
}

/** Vérifie un mot de passe contre un hash "sel:hash" stocké (comparaison à temps constant). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = fromHex(saltHex);
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  const computed = toHex(bits);
  if (computed.length !== hashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ hashHex.charCodeAt(i);
  return diff === 0;
}

// ---------- Cookie de session signé (HMAC-SHA256, sans état côté serveur) ----------
export const SESSION_COOKIE = 'ippon_session';
const SESSION_DAYS = 30;
export const SESSION_MAX_AGE = SESSION_DAYS * 86400; // secondes

function authSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET manquant (variable d'environnement à définir).");
  return s;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(authSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

export interface SessionPayload {
  uid: string;
  email: string;
  exp: number; // epoch seconds
}

/** Signe une session (30 jours). Le cookie contient uid/email en clair + signature — pas de secret dedans. */
export async function signSession(payload: Omit<SessionPayload, 'exp'>): Promise<string> {
  const full: SessionPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE };
  const body = b64url(enc.encode(JSON.stringify(full)));
  const key = await hmacKey();
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

/** Vérifie un cookie de session. Renvoie null si absent, invalide, ou expiré. */
export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    const key = await hmacKey();
    const ok = await crypto.subtle.verify('HMAC', key, b64urlDecode(sig) as BufferSource, enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------- Rate limiting en mémoire (par instance) sur les tentatives login/signup ----------
const MAX_FAILS = 10;
const WINDOW_MS = 60_000;
const BLOCK_MS = 5 * 60_000;
type Bucket = { fails: number; first: number; blockedUntil: number };
const g = globalThis as unknown as { __authRate?: Map<string, Bucket> };
const buckets: Map<string, Bucket> = (g.__authRate ??= new Map());

export function isRateLimited(key: string): boolean {
  const b = buckets.get(key);
  if (!b) return false;
  const now = Date.now();
  if (b.blockedUntil > now) return true;
  if (now - b.first > WINDOW_MS) buckets.delete(key);
  return false;
}
export function recordFailedAttempt(key: string): void {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.first > WINDOW_MS) {
    buckets.set(key, { fails: 1, first: now, blockedUntil: 0 });
    return;
  }
  b.fails += 1;
  if (b.fails >= MAX_FAILS) b.blockedUntil = now + BLOCK_MS;
}
export function clearRateLimit(key: string): void {
  buckets.delete(key);
}
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Restreint l'inscription à un domaine d'entreprise (par défaut ippon.fr).
 * Configurable via ALLOWED_EMAIL_DOMAIN (ex: "ippon.fr") pour ne pas coder le domaine en dur.
 */
export function isAllowedEmailDomain(email: string): boolean {
  const domain = (process.env.ALLOWED_EMAIL_DOMAIN || 'ippon.fr').trim().toLowerCase();
  return email.trim().toLowerCase().endsWith(`@${domain}`);
}

/**
 * Restreint l'inscription à une liste précise d'adresses (ALLOWED_EMAILS, séparées par des
 * virgules) plutôt qu'à tout un domaine. Si ALLOWED_EMAILS n'est pas configuré, on retombe sur
 * la restriction par domaine (isAllowedEmailDomain) pour ne rien casser tant que la variable
 * n'est pas définie côté hébergeur — mais la restriction fine ne prend effet qu'une fois
 * ALLOWED_EMAILS renseigné.
 */
export function isAllowedEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  const list = (process.env.ALLOWED_EMAILS || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (list.length > 0) return list.includes(e);
  return isAllowedEmailDomain(email);
}

// ---------- Réinitialisation de mot de passe (lien à usage unique, sans état côté serveur) ----------
// Le jeton contient une empreinte du hash de mot de passe ACTUEL au moment de l'émission. Dès que
// le mot de passe change (via ce flux ou un autre), l'empreinte stockée en base change aussi, donc
// tout jeton déjà émis échoue à la vérification : usage unique garanti sans avoir à retenir les
// jetons déjà consommés côté serveur (cohérent avec le reste de lib/auth.ts, 100% stateless).
const RESET_TOKEN_MINUTES = 30;

interface ResetPayload {
  uid: string;
  exp: number; // epoch seconds
  pf: string; // empreinte du hash de mot de passe au moment de l'émission du lien
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return toHex(digest);
}

/** Empreinte courte (16 hex) du hash de mot de passe — ne permet pas de retrouver le hash complet. */
export async function passwordFingerprint(passwordHash: string): Promise<string> {
  return (await sha256Hex(passwordHash)).slice(0, 16);
}

/** Émet un lien de réinitialisation (30 min) pour l'utilisateur `uid`, lié à son mot de passe actuel. */
export async function signResetToken(uid: string, passwordHash: string): Promise<string> {
  const payload: ResetPayload = {
    uid,
    exp: Math.floor(Date.now() / 1000) + RESET_TOKEN_MINUTES * 60,
    pf: await passwordFingerprint(passwordHash),
  };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey();
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

/**
 * Vérifie la signature et l'expiration d'un jeton de réinitialisation, et renvoie son contenu.
 * NE vérifie PAS encore l'usage unique : l'appelant doit ensuite comparer `pf` à
 * `passwordFingerprint(utilisateur.passwordHash)` une fois l'utilisateur chargé en base.
 */
export async function verifyResetTokenSignature(
  token: string | undefined | null,
): Promise<{ uid: string; pf: string } | null> {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    const key = await hmacKey();
    const ok = await crypto.subtle.verify('HMAC', key, b64urlDecode(sig) as BufferSource, enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as ResetPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { uid: payload.uid, pf: payload.pf };
  } catch {
    return null;
  }
}
