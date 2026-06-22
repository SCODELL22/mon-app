import { NextRequest, NextResponse } from 'next/server';

// Protection par mot de passe (HTTP Basic Auth).
// - En développement (NODE_ENV !== 'production') : si AUTH_USER/AUTH_PASSWORD
//   ne sont pas définis, la protection est désactivée (confort local).
// - En production : l'auth est OBLIGATOIRE. Si elle n'est pas configurée, on
//   refuse toutes les requêtes (fail-closed) plutôt que d'exposer les données.

const IS_PROD = process.env.NODE_ENV === 'production';

// --- Comparaison à temps constant (compatible runtime Edge) ---
// Évite les timing attacks : ne court-circuite jamais à la première différence.
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Longueurs différentes : on compare quand même contre `ab` pour limiter
  // la fuite temporelle, puis on renvoie false.
  const ref = ab.length === bb.length ? bb : ab;
  let diff = ab.length === bb.length ? 0 : 1;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ ref[i];
  return diff === 0;
}

// --- Rate limiting en mémoire (par instance) sur les échecs d'auth ---
// Suffisant pour ralentir un brute force sur un déploiement mono-instance.
const MAX_FAILS = 10; // échecs tolérés par fenêtre
const WINDOW_MS = 60_000; // fenêtre glissante d'1 min
const BLOCK_MS = 5 * 60_000; // blocage de 5 min une fois le seuil atteint

type Bucket = { fails: number; first: number; blockedUntil: number };
const g = globalThis as unknown as { __authRate?: Map<string, Bucket> };
const buckets: Map<string, Bucket> = (g.__authRate ??= new Map());

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

function isBlocked(ip: string): boolean {
  const b = buckets.get(ip);
  if (!b) return false;
  const now = Date.now();
  if (b.blockedUntil > now) return true;
  // Réinitialise la fenêtre si elle est expirée.
  if (now - b.first > WINDOW_MS) {
    buckets.delete(ip);
    return false;
  }
  return false;
}

function recordFail(ip: string): void {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now - b.first > WINDOW_MS) {
    buckets.set(ip, { fails: 1, first: now, blockedUntil: 0 });
    return;
  }
  b.fails += 1;
  if (b.fails >= MAX_FAILS) b.blockedUntil = now + BLOCK_MS;
}

function recordSuccess(ip: string): void {
  buckets.delete(ip);
}

function unauthorized(message = 'Authentication required'): NextResponse {
  return new NextResponse(message, {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Secure Area"' },
  });
}

export function proxy(req: NextRequest) {
  const USER = process.env.AUTH_USER;
  const PASSWORD = process.env.AUTH_PASSWORD;

  // Auth non configurée
  if (!USER || !PASSWORD) {
    // Fail-closed en production : on refuse tout tant que l'auth n'est pas posée.
    if (IS_PROD) {
      return new NextResponse(
        'Service indisponible : authentification non configurée (AUTH_USER / AUTH_PASSWORD).',
        { status: 503 },
      );
    }
    // Confort local uniquement.
    return NextResponse.next();
  }

  const ip = clientIp(req);

  // Trop d'échecs récents : on bloque temporairement.
  if (isBlocked(ip)) {
    return new NextResponse('Too many attempts. Try again later.', {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(BLOCK_MS / 1000)) },
    });
  }

  const basicAuth = req.headers.get('authorization');
  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1] ?? '';
    let decoded = '';
    try {
      decoded = atob(authValue);
    } catch {
      decoded = '';
    }
    const sep = decoded.indexOf(':');
    const user = sep >= 0 ? decoded.slice(0, sep) : '';
    const pwd = sep >= 0 ? decoded.slice(sep + 1) : '';
    // Les deux comparaisons sont évaluées (pas de court-circuit) pour rester
    // à temps constant sur l'ensemble identifiant + mot de passe.
    const okUser = safeEqual(user, USER);
    const okPwd = safeEqual(pwd, PASSWORD);
    if (okUser && okPwd) {
      recordSuccess(ip);
      return NextResponse.next();
    }
  }

  recordFail(ip);
  return unauthorized();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
