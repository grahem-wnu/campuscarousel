// Derived decision matrix — assembled when acceptances arrive. Joins persisted APPLICATION# rows
// that carry a real decision with their college data (cost, fit, ranking) so the family can compare
// offers side by side. Read-only; no new storage.

import type { Application, College } from '../../shared/data/index.js';

export interface DecisionRow {
  collegeId: string;
  name: string;
  decision: NonNullable<Application['decision']>;
  decisionDate?: string;
  programType?: College['programType'];
  isTopPick?: boolean;
  fitScore?: number;
  ranking?: string;
  estimatedTotalCost?: number;
  estimatedCostAfterAid?: number;
}

const decisionRank = (d: string): number =>
  d === 'accepted' ? 0 : d === 'waitlisted' ? 1 : d === 'deferred' ? 2 : 3;

/** Comparison rows for applications that have a real (non-'none') decision, best options first:
 *  accepted before waitlisted/deferred/rejected, then cheaper net cost, then stronger fit. */
export function buildDecisionMatrix(
  applications: readonly Application[],
  colleges: readonly College[],
): DecisionRow[] {
  const byId = new Map(colleges.map((c) => [c.collegeId, c]));
  return applications
    .filter((a): a is Application & { decision: NonNullable<Application['decision']> } =>
      a.decision !== undefined && a.decision !== 'none',
    )
    .map((a) => {
      const c = byId.get(a.collegeId);
      return {
        collegeId: a.collegeId,
        name: c?.name ?? a.collegeId,
        decision: a.decision,
        decisionDate: a.decisionDate,
        programType: c?.programType,
        isTopPick: c?.isTopPick,
        fitScore: c?.fitScore,
        ranking: c?.ranking,
        estimatedTotalCost: c?.estimatedTotalCost,
        estimatedCostAfterAid: c?.estimatedCostAfterAid,
      } satisfies DecisionRow;
    })
    .sort((a, b) => {
      if (decisionRank(a.decision) !== decisionRank(b.decision)) return decisionRank(a.decision) - decisionRank(b.decision);
      const ca = a.estimatedCostAfterAid ?? Number.POSITIVE_INFINITY;
      const cb = b.estimatedCostAfterAid ?? Number.POSITIVE_INFINITY;
      if (ca !== cb) return ca - cb;
      return (b.fitScore ?? 0) - (a.fitScore ?? 0);
    });
}
