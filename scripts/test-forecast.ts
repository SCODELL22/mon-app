import { quarterOf, isOverdue, buildForecast } from '../lib/forecast';
import { Opportunity } from '../lib/domain';

let failures = 0;
function check(label: string, cond: boolean, detail = '') {
  if (!cond) failures++;
  console.log(`${cond ? 'OK ' : 'XX '} ${label}${detail ? ` — ${detail}` : ''}`);
}

const NOW = new Date('2026-06-19T10:00:00Z'); // T2 2026

function opp(p: Partial<Opportunity> & Pick<Opportunity, 'id' | 'montant' | 'probabilite' | 'etape'>): Opportunity {
  return {
    id: p.id,
    nom: p.nom ?? p.id,
    client: '',
    pole: '',
    commercial: '',
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

// --- quarterOf ---
check('quarterOf juillet -> T3', JSON.stringify(quarterOf('2026-07-15')) === JSON.stringify({ year: 2026, quarter: 3 }));
check('quarterOf janvier -> T1', quarterOf('2026-01-01')!.quarter === 1);
check('quarterOf décembre -> T4', quarterOf('2026-12-31')!.quarter === 4);
check('quarterOf null', quarterOf(null) === null);

// --- isOverdue ---
const today = '2026-06-19';
check('ouvert + date passée = en retard', isOverdue(opp({ id: 'a', montant: 1, probabilite: 50, etape: 'PROPOSITION', dateCloturePrev: '2026-05-01' }), today));
check('ouvert + date future = pas en retard', !isOverdue(opp({ id: 'b', montant: 1, probabilite: 50, etape: 'PROPOSITION', dateCloturePrev: '2026-09-01' }), today));
check('gagné + date passée = pas en retard', !isOverdue(opp({ id: 'c', montant: 1, probabilite: 100, etape: 'GAGNE', dateCloturePrev: '2026-05-01' }), today));
check('ouvert sans date = pas en retard', !isOverdue(opp({ id: 'd', montant: 1, probabilite: 50, etape: 'PROPOSITION' }), today));

// --- buildForecast ---
const data: Opportunity[] = [
  opp({ id: 'fut', montant: 200000, probabilite: 50, etape: 'PROPOSITION', dateCloturePrev: '2026-07-15' }), // T3, pondéré 100000
  opp({ id: 'late', montant: 100000, probabilite: 40, etape: 'QUALIFICATION', dateCloturePrev: '2026-05-01' }), // en retard
  opp({ id: 'nodate', montant: 80000, probabilite: 25, etape: 'BESOIN_ANALYSE' }), // sans date
  opp({ id: 'won', montant: 150000, probabilite: 100, etape: 'GAGNE', dateCloturePrev: '2026-04-10' }), // gagné T2
  opp({ id: 'lost', montant: 90000, probabilite: 0, etape: 'PERDU', dateCloturePrev: '2026-08-01' }), // ignoré
];
const f = buildForecast(data, NOW);

check('1 opportunité en retard', f.overdue.length === 1 && f.overdue[0].id === 'late');
check('overduePondere = 40000', f.overduePondere === 40000, `${f.overduePondere}`);
check('1 opportunité sans date', f.undated.length === 1 && f.undated[0].id === 'nodate');
check('undatedPondere = 20000', f.undatedPondere === 20000, `${f.undatedPondere}`);

const t3 = f.quarters.find((q) => q.key === '2026-T3');
check('T3 présent avec 1 opp', !!t3 && t3.count === 1, t3 ? `count=${t3.count}` : 'absent');
check('T3 pondéré = 100000', !!t3 && t3.pondere === 100000, t3 ? `${t3.pondere}` : '');
check('T3 brut = 200000', !!t3 && t3.brut === 200000);

const t2 = f.quarters.find((q) => q.key === '2026-T2');
check('T2 gagné = 150000', !!t2 && t2.gagne === 150000, t2 ? `${t2.gagne}` : 'absent');

check('trimestres triés chronologiquement', f.quarters.map((q) => q.key).join(',') === [...f.quarters].sort((a, b) => a.year - b.year || a.quarter - b.quarter).map((q) => q.key).join(','));
check('perdu exclu de l\'atterrissage', !f.quarters.some((q) => q.key === '2026-T3' && q.brut > 200000));

console.log(failures === 0 ? '\n✅ TOUS LES TESTS PASSENT' : `\n❌ ${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
