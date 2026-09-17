// Suivi 1:1 de l’agence — écran partagé entre les espaces, voir app/1-1/_vues/saisie.tsx.
import { VueSaisie } from '../_vues/saisie';

export const dynamic = 'force-dynamic';

export default function Page(props: Omit<Parameters<typeof VueSaisie>[0], 'espace'>) {
  return <VueSaisie espace="agence" {...props} />;
}
