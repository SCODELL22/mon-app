// Suivi 1:1 de l’agence — écran partagé entre les espaces, voir app/1-1/_vues/entretien.tsx.
import { VueEntretien } from '../../_vues/entretien';

export const dynamic = 'force-dynamic';

export default function Page(props: Omit<Parameters<typeof VueEntretien>[0], 'espace'>) {
  return <VueEntretien espace="agence" {...props} />;
}
