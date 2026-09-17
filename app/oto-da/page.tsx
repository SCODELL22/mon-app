// OTO des directeurs d’agence (DG seul, cf. lib/access.ts) — écran partagé entre les espaces, voir app/1-1/_vues/tableau-de-bord.tsx.
import { VueTableauDeBord } from '../1-1/_vues/tableau-de-bord';

export const dynamic = 'force-dynamic';

export default function Page() {
  return <VueTableauDeBord espace="direction" />;
}
