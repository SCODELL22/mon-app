import fs from 'node:fs';
import { listOpportunities, getOpportunity, replaceAll, saveRawCsv, getRawCsv } from '../lib/store';
import { OpportunityInput } from '../lib/domain';

async function main() {
  let fail = 0;
  const ok = (c: boolean, m: string) => { if (!c) { fail++; console.log('XX ' + m); } else console.log('OK ' + m); };

  const items: OpportunityInput[] = [
    { id: 'A1', nom: 'Opp 1', client: 'C1', pole: 'Data', commercial: 'X', secteur: 'Banque', montant: 100000, probabilite: 50, etape: 'PROPOSITION', dateCloturePrev: '2026-09-01', notes: '' },
    { id: 'A2', nom: 'Opp 2', client: 'C2', pole: 'Data', commercial: 'Y', secteur: 'Energie', montant: 200000, probabilite: 100, etape: 'GAGNE', dateCloturePrev: null, notes: '' },
    { id: 'A3', nom: 'Opp 3', client: 'C3', pole: 'Cloud', commercial: 'X', secteur: 'Banque', montant: 50000, probabilite: 0, etape: 'ABANDONNE', dateCloturePrev: null, notes: '' },
  ];

  const n = await replaceAll('agence', items);
  ok(n === 3, 'replaceAll renvoie 3');
  ok((await listOpportunities('agence')).length === 3, 'liste = 3 après import');

  // remplace tout : un nouvel import écrase
  await replaceAll('agence', [items[0]]);
  ok((await listOpportunities('agence')).length === 1, 'remplace tout (1 après ré-import)');

  await replaceAll('agence', items);
  const got = await getOpportunity('agence', 'A2');
  ok(got?.etape === 'GAGNE' && got?.montant === 200000, 'getOpportunity A2 correct');

  const f = await listOpportunities('agence', { secteur: 'Banque' });
  ok(f.length === 2 && f.every((o) => o.secteur === 'Banque'), 'filtre secteur=Banque -> 2');

  // Imports séparés par espace : l'import France du DG n'écrase pas celui de l'agence.
  await replaceAll('direction', [items[0], items[1]]);
  ok((await listOpportunities('agence')).length === 3, 'import direction : l’import agence est intact');
  ok((await listOpportunities('direction')).length === 2, 'import direction lu séparément');
  await replaceAll('agence', [items[2]]);
  ok((await listOpportunities('direction')).length === 2, 'import agence : l’import direction est intact');
  ok((await getOpportunity('agence', 'A1')) === null, 'un id de l’import direction ne se lit pas côté agence');
  // Le CSV brut de l'agence n'est pas réécrit ici : sur un poste de dev, c'est un vrai export.
  const csvAgenceAvant = await getRawCsv('agence');
  await saveRawCsv('direction', 'csv-france');
  ok(
    (await getRawCsv('agence')) === csvAgenceAvant && (await getRawCsv('direction')) === 'csv-france',
    'CSV brut direction séparé, CSV brut agence intact',
  );

  // nettoyage des fichiers de données locaux créés par les tests
  for (const f of ['opportunities.json', 'direction-opportunities.json', 'direction-raw.csv']) {
    try {
      fs.rmSync(`.data/${f}`, { force: true });
    } catch {
      /* montage en lecture seule : sans conséquence */
    }
  }

  console.log(fail === 0 ? '\n✅ STORE OK' : `\n❌ ${fail} échec(s)`);
  process.exit(fail === 0 ? 0 : 1);
}
main();
