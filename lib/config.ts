// Listes de référence de l'agence — éditez librement ces valeurs.
// Ce sont des suggestions : les formulaires acceptent aussi la saisie libre.

export const POLES = [
  'Software Engineering',
  'Data & IA',
  'Cloud & DevOps',
  'Design & Product',
  'Cybersécurité',
  'Agilité & Delivery',
];

export const SECTEURS = [
  'Banque & Finance',
  'Assurance',
  'Énergie',
  'Industrie',
  'Retail & Luxe',
  'Secteur Public',
  'Santé',
  'Transport & Mobilité',
  'Télécom & Média',
];

export const COMMERCIAUX = [
  'Commercial 1',
  'Commercial 2',
  'Commercial 3',
];

// Objectif annuel de CA de l'agence (HT). Sert de référence dans le dashboard.
export const OBJECTIF_CA_AGENCE = 5_000_000;

// Objectif annuel de CA par commercial (HT). Les clés doivent correspondre au champ
// « Responsable manager » de BoondManager. Un commercial absent de cette table utilise
// OBJECTIF_CA_DEFAUT.
export const OBJECTIFS_COMMERCIAUX: Record<string, number> = {
  'Commercial 1': 1_800_000,
  'Commercial 2': 1_500_000,
  'Commercial 3': 1_200_000,
};

export const OBJECTIF_CA_DEFAUT = 1_000_000;

// Ratio de couverture cible (« règle des 3× ») : pipeline brut ouvert ÷ reste à faire.
// En-dessous, le commercial n'a pas assez de pipeline pour sécuriser son objectif.
export const COUVERTURE_CIBLE = 3;
