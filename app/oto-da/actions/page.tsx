// OTO des directeurs d’agence (DG seul, cf. lib/access.ts) — écran partagé entre les espaces, voir app/1-1/_vues/actions.tsx.
import { VueActions } from '../../1-1/_vues/actions';

export const dynamic = 'force-dynamic';

export default function Page() {
  return <VueActions espace="direction" />;
}
