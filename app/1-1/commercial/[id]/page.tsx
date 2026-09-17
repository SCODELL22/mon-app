// Suivi 1:1 de l’agence — écran partagé entre les espaces, voir app/1-1/_vues/fiche.tsx.
import { VueFiche } from '../../_vues/fiche';

export const dynamic = 'force-dynamic';

export default function Page(props: Omit<Parameters<typeof VueFiche>[0], 'espace'>) {
  return <VueFiche espace="agence" {...props} />;
}
