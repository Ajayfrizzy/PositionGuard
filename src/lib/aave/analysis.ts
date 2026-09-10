import type { ProtectionPolicy } from "../policies/types";
import { evaluateProtection } from "../protection/protection-engine";
import { validatePolicy } from "../policies/validator";
import type { AavePosition } from "./types";
// Explicit development preview defaults; not a saved user policy or spending authorization.
export const previewPolicy: ProtectionPolicy = {
  targetHealthFactor: "1.5", warningHealthFactor: "1.3", emergencyHealthFactor: "1.1",
  maxAutonomousAmountUsd: "500", maxDailyAutonomousAmountUsd: "1000", approvalRequiredAboveUsd: "400",
  allowRepay: true, allowAddCollateral: true, interventionCooldownMinutes: 30, enabled: true,
};
export function analyzePosition(position: AavePosition, policyInput: unknown) {
  const policy = validatePolicy(policyInput);
  return { policy, mode: "READ_ONLY_PREVIEW" as const, fundingWallet: position.wallet,
    contextAssumption: "Preview assumes zero autonomous spend and no prior execution. Wallet balances are not KeeperHub-authorized funding.",
    result: evaluateProtection(position.normalizedProtectionInput, policy, { dailyAutonomousSpendUsd: "0", nowMs: Date.parse(position.fetchedAt), lastAutonomousExecutionAtMs: null }) };
}
export type PositionAnalysis = ReturnType<typeof analyzePosition>;
