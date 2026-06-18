import { SEED_OPPORTUNITIES } from '../lib/seed-data';
import { summarize } from '../lib/aggregations';
import { isOpen, ponderation } from '../lib/domain';

let failures = 0;
function check(label: string, got: number, expected: number) {
  const ok = Math.abs(got - expected) < 0.5;
  if (!ok) failures++;
  console.log(`${ok ? 'OK ' : 'XX '} ${label}: got ${got}, expected ${expected}`);
}

const opps = SEED_OPPORTUNITIES;
const s = summarize(opps);

// Référence indépendante (boucles naïves)
const refBrut = opps.filter((o) => isOpen(o.etape)).reduce((a, o) => a + o.montant, 0);
const refPond = opps.filter((o) => isOpen(o.etape)).reduce((a, o) => a + ponderation(o), 0);
const refGagne = opps.filter((o) => o.etape === 'GAGNE').reduce((a, o) => a + o.montant, 0);
const refPerdu = opps.filter((o) => o.etape === 'PERDU').reduce((a, o) => a + o.montant, 0);
const refOuv = opps.filter((o) => isOpen(o.etape)).length;

check('total.count', s.total.count, opps.length);
check('total.ouvertes', s.total.ouvertes, refOuv);
check('total.brut', s.total.brut, refBrut);
check('total.pondere', s.total.pondere, refPond);
check('total.gagne', s.total.gagne, refGagne);
check('total.perdu', s.total.perdu, refPerdu);

// Valeurs attendues calculées à la main sur le jeu de démo
// Gagné = App citoyenne 150000 + e-santé 175000 = 325000
check('gagne (calcul main)', s.total.gagne, 325000);
// Perdu = Datalake 260000
check('perdu (calcul main)', s.total.perdu, 260000);

// Cohérence : somme des groupes = total
const sumPoleBrut = s.byPole.reduce((a, g) => a + g.brut, 0);
const sumPolePond = s.byPole.reduce((a, g) => a + g.pondere, 0);
const sumPoleGagne = s.byPole.reduce((a, g) => a + g.gagne, 0);
check('Σ byPole.brut = total.brut', sumPoleBrut, s.total.brut);
check('Σ byPole.pondere = total.pondere', sumPolePond, s.total.pondere);
check('Σ byPole.gagne = total.gagne', sumPoleGagne, s.total.gagne);

const sumComBrut = s.byCommercial.reduce((a, g) => a + g.brut, 0);
check('Σ byCommercial.brut = total.brut', sumComBrut, s.total.brut);
const sumSecPond = s.bySecteur.reduce((a, g) => a + g.pondere, 0);
check('Σ bySecteur.pondere = total.pondere', sumSecPond, s.total.pondere);

// Vérif ponderation d'un cas : Banque & Finance brut = 320000 + 130000 = 450000 ; pondéré = 160000 + 65000 = 225000
const bf = s.bySecteur.find((g) => g.key === 'Banque & Finance')!;
check('Banque&Finance brut', bf.brut, 450000);
check('Banque&Finance pondere', bf.pondere, 225000);

// byEtape : somme des pondérés ouverts = total.pondere
const etapeOpenPond = s.byEtape.filter((e) => e.etape !== 'GAGNE' && e.etape !== 'PERDU').reduce((a, e) => a + e.pondere, 0);
check('Σ byEtape(ouvert).pondere = total.pondere', etapeOpenPond, s.total.pondere);

console.log('\nRésumé total:', s.total);
console.log('\nPar pôle:', s.byPole.map((g) => `${g.key}: brut ${g.brut} / pond ${g.pondere} / gagné ${g.gagne}`));
console.log(failures === 0 ? '\n✅ TOUS LES TESTS PASSENT' : `\n❌ ${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
