// OTO des directeurs d’agence (DG seul, cf. lib/access.ts) — écran partagé entre les espaces, voir app/1-1/_vues/entretien.tsx.
import { VueEntretien } from '../../../1-1/_vues/entretien';

export const dynamic = 'force-dynamic';

export default function Page(props: Omit<Parameters<typeof VueEntretien>[0], 'espace'>) {
  return <VueEntretien espace="direction" {...props} />;
}
