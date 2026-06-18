import { NextRequest, NextResponse } from 'next/server';

// Protection par mot de passe (HTTP Basic Auth), OPTIONNELLE.
// - Si AUTH_USER ou AUTH_PASSWORD ne sont pas définis -> protection désactivée
//   (pratique en local : aucun blocage).
// - Dès que les deux sont définis (ex. en production) -> le site est protégé.
export function proxy(req: NextRequest) {
  const USER = process.env.AUTH_USER;
  const PASSWORD = process.env.AUTH_PASSWORD;

  // Auth désactivée si non configurée
  if (!USER || !PASSWORD) {
    return NextResponse.next();
  }

  const basicAuth = req.headers.get('authorization');
  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1];
    const [user, pwd] = atob(authValue).split(':');
    if (user === USER && pwd === PASSWORD) {
      return NextResponse.next();
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Secure Area"' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
