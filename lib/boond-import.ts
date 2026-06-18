// Parseur d'export BoondManager (CSV ';', encodage Latin-1) -> opportunités.
import Papa from 'papaparse';
import { Etape, OpportunityInput } from './domain';

function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// État BoondManager -> étape interne (clés normalisées).
const ETAT_MAP: Record<string, Etape> = {
  'besoin d analyse': 'BESOIN_ANALYSE',
  'qualification': 'QUALIFICATION',
  'a valider': 'A_VALIDER',
  'proposition': 'PROPOSITION',
  'negociation': 'NEGOCIATION',
  'ferme gagne': 'GAGNE',
  'gagne': 'GAGNE',
  'ferme perdu': 'PERDU',
  'perdu': 'PERDU',
  'abandonne': 'ABANDONNE',
};

function parseMontant(v: string): number {
  if (!v) return 0;
  const n = Number(v.replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : Math.round(n);
}

function parsePonderation(v: string): number {
  if (!v) return 0;
  const f = Number(v.replace(',', '.'));
  if (isNaN(f)) return 0;
  // Boond stocke une fraction 0..1 ; tolère aussi un pourcentage déjà en 0..100.
  const pct = f <= 1 ? f * 100 : f;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function parseDateFr(v: string): string | null {
  if (!v) return null;
  const m = v.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export interface ImportResult {
  opportunities: OpportunityInput[];
  rowsRead: number;
  ignored: number; // lignes sans titre ni référence
  etatsInconnus: string[]; // états non reconnus rencontrés
}

export function parseBoondCsv(text: string): ImportResult {
  // Retire un éventuel BOM
  const clean = text.replace(/^\uFEFF/, '');
  const parsed = Papa.parse<Record<string, string>>(clean, {
    header: true,
    delimiter: ';',
    skipEmptyLines: true,
  });

  const opportunities: OpportunityInput[] = [];
  const etatsInconnus = new Set<string>();
  let ignored = 0;

  for (const raw of parsed.data) {
    // index normalisé des colonnes de la ligne
    const row: Record<string, string> = {};
    for (const k of Object.keys(raw)) row[norm(k)] = (raw[k] ?? '').trim();

    const get = (...keys: string[]): string => {
      for (const k of keys) if (row[k] !== undefined && row[k] !== '') return row[k];
      return '';
    };

    const ref = get('reference interne', 'reference');
    const nom = get('titre');
    if (!ref && !nom) {
      ignored++;
      continue;
    }

    const etatRaw = get('etat');
    const etat = ETAT_MAP[norm(etatRaw)];
    if (!etat && etatRaw) etatsInconnus.add(etatRaw);

    opportunities.push({
      id: ref || crypto.randomUUID(),
      nom: nom || ref,
      client: get('societe nom', 'societe'),
      pole: get('pole'),
      commercial: get('responsable manager'),
      secteur: get('domaine d intervention', 'domaines d application'),
      montant: parseMontant(get('ca envisage ht')),
      probabilite: parsePonderation(get('ponderation')),
      etape: etat ?? 'BESOIN_ANALYSE',
      dateCloturePrev: parseDateFr(get('date de cloture')),
      notes: '',
    });
  }

  return {
    opportunities,
    rowsRead: parsed.data.length,
    ignored,
    etatsInconnus: [...etatsInconnus],
  };
}

// Décodage robuste d'un fichier téléversé : Boond exporte en Latin-1 (ISO-8859-1).
// On tente l'UTF-8 strict ; en cas d'échec, on retombe sur Latin-1.
export function decodeUpload(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('iso-8859-1').decode(buf);
  }
}
