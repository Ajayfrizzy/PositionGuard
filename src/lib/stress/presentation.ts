import type { ProtectionResult, RejectionReason } from "../protection/types";

export const presetPriceDrops = [5, 10, 15, 20] as const;
export function validateCustomPriceDrop(value: number) { return Number.isFinite(value) && value > 0 && value < 100 ? null : "Enter a price drop greater than 0% and less than 100%."; }
export function buildStressRequest(input: { asset: string; priceDrop: number; scenarioAuthorization: string }) { return { asset: input.asset, percentageShock: -input.priceDrop, scenarioAuthorization: input.scenarioAuthorization }; }
const blockerCopy: Partial<Record<RejectionReason, string>> = {
  POLICY_DISABLED: "Protection is disabled by your policy.", ACTION_DISABLED: "This protection action is not allowed by your policy.", INSUFFICIENT_BALANCE: "The available protection funding is insufficient.", AUTONOMOUS_LIMIT: "The action exceeds your policy limit.", DAILY_LIMIT: "The daily protection limit has been reached.", COOLDOWN: "The protection cooldown is still active.", SUPPLY_CAP: "The asset supply limit would be exceeded.", BELOW_TARGET: "No available action can restore the configured safety target.",
};
export function stressResultState(result: ProtectionResult) {
  if (result.riskLevel === "SAFE" || result.status === "NO_ACTION") return { kind: "safe" as const, blocker: null };
  if (result.selectedCandidate) return { kind: "actionable" as const, blocker: null };
  const reason = result.candidates.find(candidate => candidate.rejectionReason)?.rejectionReason;
  return { kind: "blocked" as const, blocker: (reason && blockerCopy[reason]) ?? result.reasoning };
}
