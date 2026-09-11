import { units } from "../financial";
import { validatePolicy } from "../policies/validator";
import type { ProtectionPolicy } from "../policies/types";
import type { RiskLevel } from "./types";
export function evaluateRisk(healthFactor: string | null, input: ProtectionPolicy): RiskLevel {
  const policy = validatePolicy(input);
  if (healthFactor === null || units(healthFactor) >= units(policy.targetHealthFactor))
    return "SAFE";
  if (units(healthFactor) >= units(policy.warningHealthFactor)) return "WATCH";
  if (units(healthFactor) >= units(policy.emergencyHealthFactor)) return "HIGH";
  return "CRITICAL";
}
