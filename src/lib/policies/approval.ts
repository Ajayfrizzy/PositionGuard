import { units } from "../financial";
import type { ProtectionPolicy } from "./types";
export function requiresApproval(amountUsd: string, policy: ProtectionPolicy): boolean {
  return units(amountUsd) > units(policy.approvalRequiredAboveUsd);
}
