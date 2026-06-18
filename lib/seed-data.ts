import { Opportunity } from './domain';

// Données de démonstration (fictives) utilisées quand aucune base n'est configurée,
// et comme jeu d'amorçage pour la base Postgres.
const now = new Date().toISOString();

function opp(p: Partial<Opportunity> & Pick<Opportunity, 'nom' | 'pole' | 'commercial' | 'secteur' | 'montant' | 'probabilite' | 'etape'>): Opportunity {
  return {
    id: p.id ?? crypto.randomUUID(),
    nom: p.nom,
    client: p.client ?? '',
    pole: p.pole,
    commercial: p.commercial,
    secteur: p.secteur,
    montant: p.montant,
    probabilite: p.probabilite,
    etape: p.etape,
    dateCloturePrev: p.dateCloturePrev ?? null,
    notes: p.notes ?? '',
    createdAt: now,
    updatedAt: now,
  };
}

export const SEED_OPPORTUNITIES: Opportunity[] = [
  opp({ nom: 'Refonte SI core banking', client: 'Banque Atlantique', pole: 'Software Engineering', commercial: 'Commercial 1', secteur: 'Banque & Finance', montant: 320000, probabilite: 50, etape: 'PROPOSITION', dateCloturePrev: '2026-09-30' }),
  opp({ nom: 'Plateforme data clients', client: 'Assur Group', pole: 'Data & IA', commercial: 'Commercial 1', secteur: 'Assurance', montant: 180000, probabilite: 75, etape: 'NEGOCIATION', dateCloturePrev: '2026-07-15' }),
  opp({ nom: 'Migration cloud AWS', client: 'EnerCorp', pole: 'Cloud & DevOps', commercial: 'Commercial 2', secteur: 'Énergie', montant: 240000, probabilite: 30, etape: 'QUALIFICATION', dateCloturePrev: '2026-11-01' }),
  opp({ nom: 'Design system mobile', client: 'RetailOne', pole: 'Design & Product', commercial: 'Commercial 2', secteur: 'Retail & Luxe', montant: 95000, probabilite: 10, etape: 'BESOIN_ANALYSE' }),
  opp({ nom: 'Audit sécurité Zero Trust', client: 'Banque Atlantique', pole: 'Cybersécurité', commercial: 'Commercial 1', secteur: 'Banque & Finance', montant: 130000, probabilite: 50, etape: 'PROPOSITION', dateCloturePrev: '2026-08-20' }),
  opp({ nom: 'Coaching agile 4 équipes', client: 'IndusTech', pole: 'Agilité & Delivery', commercial: 'Commercial 3', secteur: 'Industrie', montant: 110000, probabilite: 30, etape: 'QUALIFICATION' }),
  opp({ nom: 'LLM support client', client: 'TelMedia', pole: 'Data & IA', commercial: 'Commercial 3', secteur: 'Télécom & Média', montant: 210000, probabilite: 75, etape: 'NEGOCIATION', dateCloturePrev: '2026-07-30' }),
  opp({ nom: 'App citoyenne', client: 'Ville de Lyon', pole: 'Software Engineering', commercial: 'Commercial 2', secteur: 'Secteur Public', montant: 150000, probabilite: 100, etape: 'GAGNE', dateCloturePrev: '2026-05-15' }),
  opp({ nom: 'Plateforme e-santé', client: 'SantéPlus', pole: 'Software Engineering', commercial: 'Commercial 3', secteur: 'Santé', montant: 175000, probabilite: 100, etape: 'GAGNE', dateCloturePrev: '2026-04-10' }),
  opp({ nom: 'Datalake industriel', client: 'IndusTech', pole: 'Data & IA', commercial: 'Commercial 1', secteur: 'Industrie', montant: 260000, probabilite: 0, etape: 'PERDU' }),
  opp({ nom: 'FinOps cloud', client: 'EnerCorp', pole: 'Cloud & DevOps', commercial: 'Commercial 2', secteur: 'Énergie', montant: 88000, probabilite: 10, etape: 'BESOIN_ANALYSE' }),
  opp({ nom: 'Refonte portail assuré', client: 'Assur Group', pole: 'Design & Product', commercial: 'Commercial 1', secteur: 'Assurance', montant: 140000, probabilite: 75, etape: 'NEGOCIATION', dateCloturePrev: '2026-10-05' }),
];
