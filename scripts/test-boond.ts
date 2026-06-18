import fs from 'node:fs';
import { parseBoondCsv, decodeUpload } from '../lib/boond-import';
import type { Opportunity } from '../lib/domain';
import { summarize } from '../lib/aggregations';
import { euros } from '../lib/format';

let fail = 0;
const ok = (c: boolean, m: string) => { if (!c) { fail++; console.log('XX ' + m); } else console.log('OK ' + m); };

// 1) Test de mapping sur un CSV en ligne (états, pondération virgule, date FR, montant)
const sample = [
  'Référence interne;Titre;Type;Société - Nom;État;Domaine d\'intervention;Date de clôture;CA Envisagé HT;Pondération;Responsable manager;Pôle',
  'AO1;Mission A;Régie;ClientA;Proposition;Investment Funds;27/04/2026;74000;0,5;SCODELLARO Pascal;Software Engineering',
  'AO2;Mission B;Régie;ClientB;Fermé gagné;Industry;06/02/2026;700000;1;FASOLIN Rémi;Data',
  'AO3;Mission C;Régie;ClientC;Fermé perdu;Insurance;16/06/2026;80000;0;MAHIEUX Pierre;Cloud&DevOps',
  'AO4;Mission D;Régie;ClientD;Abandonné;Luxury;;30000;0;SCODELLARO Pascal;Data',
].join('\n');

const r = parseBoondCsv(sample);
ok(r.opportunities.length === 4, '4 opportunités parsées');
const a1 = r.opportunities.find((o) => o.id === 'AO1')!;
ok(a1.nom === 'Mission A', 'titre -> nom');
ok(a1.client === 'ClientA', 'société -> client');
ok(a1.pole === 'Software Engineering', 'pôle');
ok(a1.commercial === 'SCODELLARO Pascal', 'responsable manager -> commercial');
ok(a1.secteur === 'Investment Funds', 'domaine -> secteur');
ok(a1.montant === 74000, 'CA envisagé -> montant');
ok(a1.probabilite === 50, 'pondération 0,5 -> 50%');
ok(a1.etape === 'PROPOSITION', 'état Proposition -> PROPOSITION');
ok(a1.dateCloturePrev === '2026-04-27', 'date FR -> ISO');
ok(r.opportunities.find((o) => o.id === 'AO2')!.etape === 'GAGNE', 'Fermé gagné -> GAGNE');
ok(r.opportunities.find((o) => o.id === 'AO3')!.etape === 'PERDU', 'Fermé perdu -> PERDU');
ok(r.opportunities.find((o) => o.id === 'AO4')!.etape === 'ABANDONNE', 'Abandonné -> ABANDONNE');

// 2) Si le vrai export est présent dans le bac d'upload, on l'analyse aussi
const realPath = '/sessions/lucid-charming-faraday/mnt/uploads/besoins (42).csv';
if (fs.existsSync(realPath)) {
  const buf = fs.readFileSync(realPath);
  const text = decodeUpload(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const real = parseBoondCsv(text);
  ok(real.opportunities.length > 500, `export réel : ${real.opportunities.length} opportunités`);
  ok(real.etatsInconnus.length === 0, `aucun état inconnu (vus: ${real.etatsInconnus.join(', ') || 'aucun'})`);
  const s = summarize(real.opportunities as unknown as Opportunity[]);
  console.log(`\n   Réel -> total ${s.total.count} | gagné ${euros(s.total.gagne)} | pipeline pondéré ${euros(s.total.pondere)} | perdu/abandonné ${euros(s.total.perdu)}`);
  console.log('   Top pôles:', s.byPole.slice(0, 3).map((g) => `${g.key} (${euros(g.pondere)})`).join(' · '));
} else {
  console.log('   (export réel absent — test ignoré)');
}

console.log(fail === 0 ? '\n✅ BOOND IMPORT OK' : `\n❌ ${fail} échec(s)`);
process.exit(fail === 0 ? 0 : 1);
