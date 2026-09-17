// Suivi 1:1 de l’agence — écran partagé entre les espaces, voir app/1-1/_vues/tableau-de-bord.tsx.
import { VueTableauDeBord } from './_vues/tableau-de-bord';

export const dynamic = 'force-dynamic';

export default function Page() {
  return <VueTableauDeBord espace="agence" />;
}
