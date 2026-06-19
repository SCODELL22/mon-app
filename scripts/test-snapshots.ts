import { SEED_OPPORTUNITIES } from '../lib/seed-data';
import { summarize } from '../lib/aggregations';
import {
  makeSnapshot,
  computeDelta,
  computeTransitions,
  winRate,
  trendSeries,
} from '../lib/snapshots';
import { Opportunity } from '../lib/domain';

let failures = 0;
function check(label: string, cond: boolean, detail = '') {
  if (!cond) failures++;
  console.log(`${cond ? 'OK ' : 'XX '} ${label}${detail ? ` — ${detail}` : ''}`);
}

const opps = SEED_OPPORTUNITIES;
const s = summarize(opps);

// --- makeSnapshot reflète les agrégats de summarize ---
const snap = makeSnapshot(opps, new Date('2026-06-01T09:00:00Z'));
check('snapshot.count = total.count', snap.count === s.total.count, `${snap.count}`);
check('snapshot.pondere = total.pondere', snap.pondere === s.total.pondere, `${snap.pondere}`);
check('snapshot.gagne = total.gagne', snap.gagne === s.total.gagne, `${snap.gagne}`);
check('snapshot.id sûr pour un nom de fichier', !/[:.]/.test(snap.id), snap.id);
check('snapshot conserve le détail', snap.opportunities.length === opps.length);

// --- computeDelta ---
const prevMeta = { ...snap, pondere: snap.pondere - 50000, gagne: snap.gagne - 20000 };
const d = computeDelta(snap, prevMeta)!;
check('delta.pondere', d.pondere === 50000, `${d.pondere}`);
check('delta.gagne', d.gagne === 20000, `${d.gagne}`);
check('delta null sans précédent', computeDelta(snap, null) === null);

// --- computeTransitions : un deal ouvert passe à GAGNE, un autre disparaît, un nouveau arrive ---
const base: Opportunity[] = opps.slice(0, 3).map((o) => ({ ...o, etape: 'PROPOSITION' }));
const prevSnap = makeSnapshot(base, new Date('2026-06-01T09:00:00Z'));

const curr: Opportunity[] = [
  { ...base[0], etape: 'GAGNE' }, // signé
  { ...base[1], etape: 'PERDU' }, // perdu
  // base[2] disparaît
  { ...base[0], id: 'NEW-1', nom: 'Nouvelle affaire', etape: 'QUALIFICATION' }, // nouvelle
];
const currSnap = makeSnapshot(curr, new Date('2026-06-08T09:00:00Z'));
const t = computeTransitions(prevSnap, currSnap);
check('transitions.gagnees = 1', t.gagnees.length === 1, t.gagnees.map((o) => o.id).join(','));
check('transitions.perdues = 1', t.perdues.length === 1);
check('transitions.nouvelles = 1', t.nouvelles.length === 1 && t.nouvelles[0].id === 'NEW-1');
check('transitions.disparues = 1', t.disparues === 1);

// --- winRate ---
const wr = winRate([prevSnap, currSnap]);
check('winRate gagnees=1 perdues=1 taux=50', wr.gagnees === 1 && wr.perdues === 1 && wr.taux === 50, `${wr.taux}`);
check('winRate null si pas de clôtures', winRate([prevSnap]).taux === null);

// --- trendSeries : tri chronologique croissant ---
const series = trendSeries([currSnap, prevSnap]);
check('trendSeries triée par date', series[0].takenAt < series[1].takenAt);
check('trendSeries longueur', series.length === 2);

console.log(failures === 0 ? '\n✅ TOUS LES TESTS PASSENT' : `\n❌ ${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
