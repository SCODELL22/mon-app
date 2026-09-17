// Configuration lue par public/pipeline.html (page statique, sans accès au serveur) :
//   - GET /api/config                    -> espace agence : le compte connecté est-il DG ?
//                                           (affiche les liens vers l'espace direction)
//   - GET /api/config?espace=direction   -> réservé au DG : rattachement agence -> DA.
import { acces, estEmailDg, refus } from '@/lib/access';
import { verifySession, SESSION_COOKIE } from '@/lib/auth';
import { listCommerciaux } from '@/lib/one-on-one-store';
import { espaceDeRequete } from '@/lib/espace';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const SANS_CACHE = { 'Cache-Control': 'no-store' };

export async function GET(req: Request) {
  const espace = espaceDeRequete(req);

  if (espace === 'direction') {
    const a = await acces('direction');
    if (!a.estAdmin) return refus('forbidden');
    const fiches = await listCommerciaux('direction');
    const directeurs = Object.fromEntries(
      fiches.filter((c) => c.libelleBoond).map((c) => [c.libelleBoond, c.nom]),
    );
    return Response.json({ espace, directeurs }, { headers: SANS_CACHE });
  }

  // Espace agence : seule information renvoyée, le droit d'ouvrir l'espace direction.
  let estDg = false;
  if (!process.env.AUTH_SECRET && process.env.NODE_ENV !== 'production') {
    estDg = true; // développement local sans authentification
  } else {
    const jar = await cookies();
    const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
    estDg = !!session && estEmailDg(session.email);
  }
  return Response.json({ espace, estDg }, { headers: SANS_CACHE });
}
