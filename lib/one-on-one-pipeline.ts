// Pont entre le suivi 1:1 et les données BoondManager déjà présentes dans l'app.
//
// Intérêt de l'intégration : le manager n'a pas à ressaisir les chiffres du commercial, ils sont
// lus depuis le dernier import. Le rattachement se fait sur `Commercial.libelleBoond`, qui doit
// reprendre À L'IDENTIQUE le champ « Responsable manager » de l'export (cf. /1-1/commerciaux).
import { listOpportunities } from './store';
import { isOpen, ponderation, statutOf, type Opportunity } from './domain';
import type { Commercial } from './one-on-one';

export interface PipelineCommercial {
  /** false si le commercial n'a pas de libellé Boond, ou si ce libellé n'existe pas dans l'import. */
  rattache: boolean;
  nbOuvertes: number;
  brut: number; // somme des montants ouverts
  pondere: number; // somme des montants × probabilité
  gagne: number; // CA gagné
  /** Affaires ouvertes les plus significatives, triées par montant pondéré décroissant. */
  principales: Opportunity[];
  /** Opportunités ouvertes dont la date de clôture prévue est dépassée — sujet classique de 1:1. */
  enRetard: Opportunity[];
}

export const PIPELINE_VIDE: PipelineCommercial = {
  rattache: false,
  nbOuvertes: 0,
  brut: 0,
  pondere: 0,
  gagne: 0,
  principales: [],
  enRetard: [],
};

/**
 * Calcule le pipeline d'un commercial à partir des opportunités importées.
 * `today` est injecté pour rester testable (même principe que isEnRetard dans one-on-one.ts).
 */
export function calculerPipeline(
  opps: Opportunity[],
  libelleBoond: string,
  today: string,
): PipelineCommercial {
  if (!libelleBoond) return PIPELINE_VIDE;
  const siennes = opps.filter((o) => o.commercial === libelleBoond);
  if (siennes.length === 0) return PIPELINE_VIDE;

  const ouvertes = siennes.filter((o) => isOpen(o.etape));
  return {
    rattache: true,
    nbOuvertes: ouvertes.length,
    brut: ouvertes.reduce((s, o) => s + o.montant, 0),
    pondere: ouvertes.reduce((s, o) => s + ponderation(o), 0),
    gagne: siennes.filter((o) => statutOf(o.etape) === 'won').reduce((s, o) => s + o.montant, 0),
    principales: [...ouvertes].sort((a, b) => ponderation(b) - ponderation(a)).slice(0, 6),
    enRetard: ouvertes.filter((o) => o.dateCloturePrev !== null && o.dateCloturePrev < today),
  };
}

/** Version I/O : charge les opportunités puis délègue au calcul pur. */
export async function pipelineDuCommercial(
  c: Pick<Commercial, 'libelleBoond'>,
  today: string,
): Promise<PipelineCommercial> {
  if (!c.libelleBoond) return PIPELINE_VIDE;
  const opps = await listOpportunities();
  return calculerPipeline(opps, c.libelleBoond, today);
}
