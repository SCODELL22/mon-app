import fs from 'node:fs';
import { listOpportunities, getOpportunity, replaceAll } from '../lib/store';
import { OpportunityInput } from '../lib/domain';

async function main() {
  let fail = 0;
  const ok = (c: boolean, m: string) => { if (!c) { fail++; console.log('XX ' + m); } else console.log('OK ' + m); };

  const items: OpportunityInput[] = [
    { id: 'A1', nom: 'Opp 1', client: 'C1', pole: 'Data', commercial: 'X', secteur: 'Banque', montant: 100000, probabilite: 50, etape: 'PROPOSITION', dateCloturePrev: '2026-09-01', notes: '' },
    { id: 'A2', nom: 'Opp 2', client: 'C2', pole: 'Data', commercial: 'Y', secteur: 'Energie', montant: 200000, probabilite: 100, etape: 'GAGNE', dateCloturePrev: null, notes: '' },
    { id: 'A3', nom: 'Opp 3', client: 'C3', pole: 'Cloud', commercial: 'X', secteur: 'Banque', montant: 50000, probabilite: 0, etape: 'ABANDONNE', dateCloturePrev: null, notes: '' },
  ];

  const n = await replaceAll(items);
  ok(n === 3, 'replaceAll renvoie 3');
  ok((await listOpportunities()).length === 3, 'liste = 3 après import');

  // remplace tout : un nouvel import écrase
  await replaceAll([items[0]]);
  ok((await listOpportunities()).length === 1, 'remplace tout (1 après ré-import)');

  await replaceAll(items);
  const got = await getOpportunity('A2');
  ok(got?.etape === 'GAGNE' && got?.montant === 200000, 'getOpportunity A2 correct');

  const f = await listOpportunities({ secteur: 'Banque' });
  ok(f.length === 2 && f.every((o) => o.secteur === 'Banque'), 'filtre secteur=Banque -> 2');

  // nettoyage du fichier de données local créé par les tests
  fs.rmSync('.data/opportunities.json', { force: true });

  console.log(fail === 0 ? '\n✅ STORE OK' : `\n❌ ${fail} échec(s)`);
  process.exit(fail === 0 ? 0 : 1);
}
main();
