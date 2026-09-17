// Configuration de l'instance lue par public/pipeline.html (page statique, sans accès aux
// variables d'environnement) : périmètre, et en périmètre France le rattachement agence -> DA.
//
// Le nom des DA n'est renvoyé qu'aux administrateurs du module OTO : c'est la seule information
// issue des fiches qui sort ici, et elle ne sort que vers ceux qui les gèrent déjà.
import { acces } from '@/lib/access';
import { listCommerciaux } from '@/lib/one-on-one-store';
import { perimetre } from '@/lib/perimetre';

export const dynamic = 'force-dynamic';

export async function GET() {
  const p = perimetre();
  let directeurs: Record<string, string> = {};
  if (p === 'france') {
    const a = await acces();
    if (a.estAdmin) {
      const fiches = await listCommerciaux();
      directeurs = Object.fromEntries(
        fiches.filter((c) => c.libelleBoond).map((c) => [c.libelleBoond, c.nom]),
      );
    }
  }
  return Response.json(
    { perimetre: p, directeurs },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
