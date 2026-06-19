import { objectivesByCommercial } from '../lib/objectives';
import { Opportunity } from '../lib/domain';

let failures = 0;
function check(label: string, cond: boolean, detail = '') {
  if (!cond) failures++;
  console.log(`${cond ? 'OK ' : 'XX '} ${label}${detail ? ` — ${detail}` : ''}`);
}

function opp(p: Partial<Opportunity> & Pick<Opportunity, 'id' | 'commercial' | 'montant' | 'probabilite' | 'etape'>): Opportunity {
  return {
    id: p.id,
    nom: p.id,
    client: '',
    pole: '',
    commercial: p.commercial,
    secteur: '',
    montant: p.montant,
    probabilite: p.probabilite,
    etape: p.etape,
    dateCloturePrev: p.dateCloturePrev ?? null,
    notes: '',
    createdAt: '',
    updatedAt: '',
  };
}

const data: Opportunity[] = [
  opp({ id: 'a', commercial: 'Alice', montant: 200000, probabilite: 50, etape: 'PROPOSITION' }), // ouvert: brut 200k, pond 100k
  opp({ id: 'b', commercial: 'Alice', montant: 300000, probabilite: 100, etape: 'GAGNE' }), // gagné 300k
  opp({ id: 'c', commercial: 'Bob', montant: 400000, probabilite: 25, etape: 'QUALIFICATION' }), // ouvert: brut 400k, pond 100k
  opp({ id: 'd', commercial: 'Bob', montant: 100000, probabilite: 0, etape: 'PERDU' }), // ignoré
];

const quotas = { Alice: 500000, Bob: 1000000 };
const { rows, total } = objectivesByCommercial(data, quotas, 250000);

const alice = rows.find((r) => r.commercial === 'Alice')!;
const bob = rows.find((r) => r.commercial === 'Bob')!;

// Alice : gagné 300k, quota 500k -> reste 200k ; brut 200k -> couverture 1.0
check('Alice gagné', alice.gagne === 300000);
check('Alice pondéré', alice.pondere === 100000);
check('Alice reste à faire', alice.resteAFaire === 200000, `${alice.resteAFaire}`);
check('Alice atterrissage', alice.atterrissage === 400000);
check('Alice écart objectif', alice.ecartObjectif === -100000, `${alice.ecartObjectif}`);
check('Alice progression 60%', Math.round(alice.progression) === 60);
check('Alice couverture 1.0', alice.couverture === 1, `${alice.couverture}`);

// Bob : gagné 0, quota 1M -> reste 1M ; brut 400k -> couverture 0.4
check('Bob couverture 0.4', bob.couverture === 0.4, `${bob.couverture}`);
check('Bob perdu ignoré du brut', bob.brut === 400000, `${bob.brut}`);

// Tri par quota décroissant : Bob (1M) avant Alice (500k)
check('tri par quota desc', rows[0].commercial === 'Bob');

// Quota présent sans opportunité -> apparaît avec couverture 0 ou null
const data2: Opportunity[] = [opp({ id: 'x', commercial: 'Alice', montant: 100000, probabilite: 50, etape: 'PROPOSITION' })];
const r2 = objectivesByCommercial(data2, { Carol: 300000 }, 250000);
check('commercial à quota sans opp listé', r2.rows.some((r) => r.commercial === 'Carol'));

// Objectif déjà atteint -> couverture null
const data3: Opportunity[] = [opp({ id: 'y', commercial: 'Dan', montant: 600000, probabilite: 100, etape: 'GAGNE' })];
const r3 = objectivesByCommercial(data3, { Dan: 500000 }, 250000);
check('objectif atteint -> couverture null', r3.rows[0].couverture === null);

// Totaux agence
check('total quota = somme', total.quota === 1500000, `${total.quota}`);
check('total gagné = somme', total.gagne === 300000);
check('total pondéré = somme', total.pondere === 200000);

console.log(failures === 0 ? '\n✅ TOUS LES TESTS PASSENT' : `\n❌ ${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
