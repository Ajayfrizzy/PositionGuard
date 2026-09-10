import { units } from "../financial";
import type { CandidateAction } from "./types";
export function rankCandidates(candidates: readonly CandidateAction[]): CandidateAction[] {
  return [...candidates].sort((a, b) => {
    if (a.reachesTarget !== b.reachesTarget) return a.reachesTarget ? -1 : 1;
    if (a.policyValidity !== b.policyValidity) return a.policyValidity ? -1 : 1;
    const x = units(a.estimatedUsdValue), y = units(b.estimatedUsdValue);
    if (x !== y) return x < y ? -1 : 1;
    if (a.requiresApproval !== b.requiresApproval) return a.requiresApproval ? 1 : -1;
    if (a.type !== b.type) return a.type === "REPAY_DEBT" ? -1 : 1;
    return a.id.localeCompare(b.id);
  }).map((c, index) => ({ ...c, rank: index + 1 }));
}
