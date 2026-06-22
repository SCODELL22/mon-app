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
  'Thomas CIBOULET',
  'Alexandre DE CLIPPELEIR',
  'Rémi FASOLIN',
  'Eliza BAETEMAN',
  'Pierre MAHIEUX',
  'Caroline LOPES',
  'Xavier BONNET',
  'Pascal SCODELLARO',
];

// Objectif annuel de CA de l'agence (HT). Sert de référence dans le dashboard.
export const OBJECTIF_CA_AGENCE = 24_500_000;

// Objectif annuel de CA par commercial (HT) — source : slides « BILAN 25 & OBJECTIFS 26 ».
// Les clés correspondent au champ « Responsable manager » / commercial.
export const OBJECTIFS_COMMERCIAUX: Record<string, number> = {
  'Pascal SCODELLARO': 6_200_000,
  'Xavier BONNET': 5_550_000,
  'Thomas CIBOULET': 4_090_000,
  'Rémi FASOLIN': 4_130_000,
  'Pierre MAHIEUX': 3_750_000,
  'Caroline LOPES': 2_000_000,
  'Eliza BAETEMAN': 1_200_000,
  'Alexandre DE CLIPPELEIR': 1_110_000,
};

export const OBJECTIF_CA_DEFAUT = 1_000_000;

// Mapping compte (client) -> commercial, établi depuis les slides 2026.
// Sert à attribuer le CA / la marge facturés (export « Facturation ») au bon commercial.
// Un client absent de cette table est rangé en « Non attribué ».
export const CLIENT_COMMERCIAL: Record<string, string> = {
  'AGENCE DU SERVICE CIVIQUE': 'Eliza BAETEMAN',
  'DNUM (Ministères sociaux)': 'Eliza BAETEMAN',
  'FRANCE MEDIA MONDE': 'Eliza BAETEMAN',
  'INSEE (ATOS)': 'Eliza BAETEMAN',
  'LA FABRIQUE NUMERIQUE DES MINISTERES SOCIAUX': 'Eliza BAETEMAN',
  "MINISTERE DE L'INTERIEUR": 'Eliza BAETEMAN',
  'OFFICE FRANCAIS BIODIVERSITE': 'Eliza BAETEMAN',
  'SMILE': 'Eliza BAETEMAN',
  'AGREGIO SOLUTIONS': 'Xavier BONNET',
  'EDF - DIGIT - DAOA (Randstad Digital)': 'Xavier BONNET',
  'EDF - DST - CSP AS - SAGE / EDF SMARTSIDE': 'Xavier BONNET',
  'EDF POWER SOLUTIONS': 'Xavier BONNET',
  'EDF – DTEO – DIGIT (Randstad Digital)': 'Xavier BONNET',
  'ELECTRICITE DE FRANCE': 'Xavier BONNET',
  'ENEDIS CLIFFS PARIS': 'Xavier BONNET',
  'ENEDIS NEXUS PARIS': 'Xavier BONNET',
  'ENEDIS PRISME PARIS': 'Xavier BONNET',
  "RTE Réseau de Transport d'Electricité": 'Xavier BONNET',
  'AIR LIQUIDE IT': 'Caroline LOPES',
  'ENGIE DIGITAL': 'Caroline LOPES',
  'EUROWATT SERVICES': 'Caroline LOPES',
  'SAFRAN GROUP (BETEAM)': 'Caroline LOPES',
  'SAINT GOBAIN DISTRIBUTION BATIMENT FRANCE': 'Caroline LOPES',
  'TOTAL ENERGIES CHARGING SERVICES': 'Caroline LOPES',
  'TOTALENERGIES ELECTRICITE ET GAZ FRANCE': 'Caroline LOPES',
  'TOTSA TotalEnergies Trading SA': 'Caroline LOPES',
  'FAURECIA': 'Pierre MAHIEUX',
  'SUEZ IWS': 'Pierre MAHIEUX',
  'THALES GLOBAL SERVICES SAS': 'Pierre MAHIEUX',
  'CHANEL': 'Rémi FASOLIN',
  'FEDERATION FRANCAISE DE TENNIS': 'Rémi FASOLIN',
  'FEDERATION FRANCAISE DE VOLLEY': 'Rémi FASOLIN',
  'FFEPGV': 'Rémi FASOLIN',
  'FFR FEDERATION FRANCAISE DE RUGBY': 'Rémi FASOLIN',
  'KERING SA SHARED PARIS': 'Rémi FASOLIN',
  'PERNOD RICARD SA': 'Rémi FASOLIN',
  'Pernod Ricard': 'Rémi FASOLIN',
  'Allianz Technology SAS': 'Pascal SCODELLARO',
  'BFORBANK': 'Pascal SCODELLARO',
  'BPIFRANCE': 'Pascal SCODELLARO',
  'Capital Fund Management': 'Pascal SCODELLARO',
  'ORANGE BANK': 'Pascal SCODELLARO',
  'SOCIETE GENERALE SA': 'Pascal SCODELLARO',
  'JC DECAUX': 'Thomas CIBOULET',
  'CRIT SAS': 'Thomas CIBOULET',
  'CANAL + TECH': 'Thomas CIBOULET',
  'Prudence Créole': 'Alexandre DE CLIPPELEIR',
  'Clariane': 'Alexandre DE CLIPPELEIR',
  'GIPHAR GROUPE': 'Alexandre DE CLIPPELEIR',
};

export const NON_ATTRIBUE = 'Non attribué';

// Ratio de couverture cible (« règle des 3× ») : pipeline brut ouvert ÷ reste à faire.
// En-dessous, le commercial n'a pas assez de pipeline pour sécuriser son objectif.
export const COUVERTURE_CIBLE = 3;
