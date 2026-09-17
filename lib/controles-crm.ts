// Contrôles de qualité de saisie CRM sur les opportunités importées — fonctions pures.
//
// Ces règles existent aussi en JavaScript dans public/pipeline.html (onglets « Qualité saisie »
// et « Contrôle agences »), qui travaille directement sur le CSV brut. Toute modification ici
// doit être reportée là-bas, et inversement : c'est la dette « deux sources de vérité » connue.
import { isOpen, type Opportunity } from './domain';

export interface ControlesCrm {
  /** Ouvertes, hors projets internes, date de démarrage réelle passée (« Immédiate » ignorée). */
  demarrageDepasse: Opportunity[];
  /** Ouvertes, hors projets internes, date de clôture passée. */
  clotureDepassee: Opportunity[];
  /** Hors projets internes, pôle contenant « business » (Business development) : à recatégoriser. */
  poleBusinessDev: Opportunity[];
}

export function estProjetInterne(o: Pick<Opportunity, 'typeBesoin'>): boolean {
  return (o.typeBesoin ?? '') === 'Projet Interne';
}

export function estPoleBusinessDev(o: Pick<Opportunity, 'pole'>): boolean {
  return (o.pole ?? '').toLowerCase().includes('business');
}

/** `today` au format 'YYYY-MM-DD', injecté pour rester testable. */
export function controlesCrm(opps: Opportunity[], today: string): ControlesCrm {
  const reelles = opps.filter((o) => !estProjetInterne(o));
  const ouvertes = reelles.filter((o) => isOpen(o.etape));
  return {
    demarrageDepasse: ouvertes.filter((o) => !!o.dateDemarrage && o.dateDemarrage < today),
    clotureDepassee: ouvertes.filter((o) => !!o.dateCloturePrev && o.dateCloturePrev < today),
    poleBusinessDev: reelles.filter(estPoleBusinessDev),
  };
}
