// OTO des directeurs d’agence (DG seul, cf. lib/access.ts) — écran partagé entre les espaces, voir app/1-1/_vues/fiches.tsx.
import { VueFiches } from '../../1-1/_vues/fiches';

export const dynamic = 'force-dynamic';

export default function Page(props: Omit<Parameters<typeof VueFiches>[0], 'espace'>) {
  return <VueFiches espace="direction" {...props} />;
}
