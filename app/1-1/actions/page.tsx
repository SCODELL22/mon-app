// Suivi 1:1 de l’agence — écran partagé entre les espaces, voir app/1-1/_vues/actions.tsx.
import { VueActions } from '../_vues/actions';

export const dynamic = 'force-dynamic';

export default function Page() {
  return <VueActions espace="agence" />;
}
