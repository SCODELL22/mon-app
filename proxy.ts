import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession, SESSION_COOKIE } from '@/lib/auth';

// Protection par compte (email + mot de passe individuels, cf. /signup et /login) — remplace
// l'ancienne Basic Auth partagée (AUTH_USER/AUTH_PASSWORD).
// - En développement : si AUTH_SECRET n'est pas défini, la protection est désactivée (confort local).
// - En production : AUTH_SECRET est OBLIGATOIRE. Sans lui, on refuse toutes les requêtes
//   (fail-closed) plutôt que d'exposer les données.

const IS_PROD = process.env.NODE_ENV === 'production';

export async function proxy(request: NextRequest) {
  if (!process.env.AUTH_SECRET) {
    if (IS_PROD) {
      return new NextResponse('Service indisponible : authentification non configurée (AUTH_SECRET).', {
        status: 503,
      });
    }
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (session) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|login|signup|api/auth).*)'],
};
