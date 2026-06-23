import { NextRequest, NextResponse } from 'next/server';

// Protection par mot de passe (HTTP Basic Auth).
// - En développement : si AUTH_USER/AUTH_PASSWORD ne sont pas définis, la protection
//   est désactivée (confort local).
// - En production : l'auth est OBLIGATOIRE. Si elle n'est pas configurée, on refuse
//   toutes les requêtes (fail-closed) plutôt que d'exposer les données.

const IS_PROD = process.env.NODE_ENV === 'production';

// Comparaison à temps constant (compatible runtime Edge) : pas de court-circuit,
// pour ne pas révéler la longueur/contenu via le timing.
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const ref = ab.length === bb.length ? bb : ab;
  let diff = ab.length === bb.length ? 0 : 1;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ ref[i];
  return diff === 0;
}

// Rate limiting en mémoire (par instance) sur les échecs d'auth : ralentit le brute force.
const MAX_FAILS = 10;
const WINDOW_MS = 60_000;
const BLOCK_MS = 5 * 60_000;
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
  if (now - b.first > WINDOW_MS) buckets.delete(ip);
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

export function proxy(req: NextRequest) {
  const USER = process.env.AUTH_USER;
  const PASSWORD = process.env.AUTH_PASSWORD;

  if (!USER || !PASSWORD) {
    if (IS_PROD) {
      return new NextResponse(
        'Service indisponible : authentification non configurée (AUTH_USER / AUTH_PASSWORD).',
        { status: 503 },
      );
    }
    return NextResponse.next();
  }

  const ip = clientIp(req);
  if (isBlocked(ip)) {
    return new NextResponse('Too many attempts. Try again later.', {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(BLOCK_MS / 1000)) },
    });
  }

  const basicAuth = req.headers.get('authorization');
  if (basicAuth) {
    let decoded = '';
    try {
      decoded = atob(basicAuth.split(' ')[1] ?? '');
    } catch {
      decoded = '';
    }
    const sep = decoded.indexOf(':');
    const user = sep >= 0 ? decoded.slice(0, sep) : '';
    const pwd = sep >= 0 ? decoded.slice(sep + 1) : '';
    // Les deux comparaisons sont évaluées (pas de court-circuit) pour rester à temps constant.
    const okUser = safeEqual(user, USER);
    const okPwd = safeEqual(pwd, PASSWORD);
    if (okUser && okPwd) {
      buckets.delete(ip);
      return NextResponse.next();
    }
  }

  recordFail(ip);
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Secure Area"' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
