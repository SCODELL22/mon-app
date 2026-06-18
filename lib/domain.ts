// Domaine métier — types et constantes, sans dépendance technique (testable seul).
// Les étapes correspondent aux états BoondManager.

export type Etape =
  | 'BESOIN_ANALYSE'
  | 'QUALIFICATION'
  | 'A_VALIDER'
  | 'PROPOSITION'
  | 'NEGOCIATION'
  | 'GAGNE'
  | 'PERDU'
  | 'ABANDONNE';

export type Statut = 'open' | 'won' | 'lost';

export interface Opportunity {
  id: string; // Référence interne BoondManager
  nom: string; // Titre
  client: string; // Société - Nom
  pole: string;
  commercial: string; // Responsable manager
  secteur: string; // Domaine d'intervention
  montant: number; // CA Envisagé HT
  probabilite: number; // 0 à 100 (Pondération × 100)
  etape: Etape; // État
  dateCloturePrev: string | null; // Date de clôture, 'YYYY-MM-DD'
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type OpportunityInput = Omit<Opportunity, 'createdAt' | 'updatedAt'>;

export interface EtapeMeta {
  value: Etape;
  label: string;
  statut: Statut;
  color: string;
}

export const ETAPES: EtapeMeta[] = [
  { value: 'BESOIN_ANALYSE', label: "Besoin d'analyse", statut: 'open', color: '#94a3b8' },
  { value: 'QUALIFICATION', label: 'Qualification', statut: 'open', color: '#38bdf8' },
  { value: 'A_VALIDER', label: 'À valider', statut: 'open', color: '#22d3ee' },
  { value: 'PROPOSITION', label: 'Proposition', statut: 'open', color: '#6366f1' },
  { value: 'NEGOCIATION', label: 'Négociation', statut: 'open', color: '#f59e0b' },
  { value: 'GAGNE', label: 'Gagné', statut: 'won', color: '#22c55e' },
  { value: 'PERDU', label: 'Perdu', statut: 'lost', color: '#ef4444' },
  { value: 'ABANDONNE', label: 'Abandonné', statut: 'lost', color: '#a1a1aa' },
];

export const ETAPE_META: Record<Etape, EtapeMeta> = Object.fromEntries(
  ETAPES.map((e) => [e.value, e]),
) as Record<Etape, EtapeMeta>;

export function statutOf(etape: Etape): Statut {
  return ETAPE_META[etape]?.statut ?? 'open';
}

/** Une opportunité est "ouverte" tant qu'elle n'est ni gagnée ni perdue/abandonnée. */
export function isOpen(etape: Etape): boolean {
  return statutOf(etape) === 'open';
}

/** CA pondéré d'une opportunité = montant × probabilité / 100. */
export function ponderation(o: Pick<Opportunity, 'montant' | 'probabilite'>): number {
  return Math.round((o.montant * o.probabilite) / 100);
}
