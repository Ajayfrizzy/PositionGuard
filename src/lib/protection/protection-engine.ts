import { evaluatePortfolio } from "./portfolio-engine";
import { validatePolicy, policyContextSchema } from "../policies/validator";
import { positionSchema } from "./outcome-estimator";
import { evaluateRisk } from "./risk-engine";
import { generateCandidates } from "./candidate-generator";
import { rankCandidates } from "./candidate-ranker";
import type { ProtectionResult } from "./types";
export function evaluateProtection(
  positionInput: unknown,
  policyInput: unknown,
  contextInput: unknown,
): ProtectionResult {
  if (typeof positionInput === "object" && positionInput !== null && "model" in positionInput)
    return evaluatePortfolio(positionInput, policyInput, contextInput);
  const p = positionSchema.parse(positionInput),
    policy = validatePolicy(policyInput),
    context = policyContextSchema.parse(contextInput);
  const riskLevel = evaluateRisk(p.healthFactor, policy);
  if (riskLevel === "SAFE")
    return {
      action: "NO_ACTION",
      status: "NO_ACTION",
      riskLevel,
      selectedCandidate: null,
      candidates: [],
      reasoning: "Position already meets target or has no debt.",
    };
  const candidates = rankCandidates(generateCandidates(p, policy, context));
  const selectedCandidate =
    candidates.find((c) => c.valid && !c.requiresApproval) ??
    candidates.find((c) => c.valid) ??
    null;
  if (!selectedCandidate)
    return {
      action: "NO_ACTION",
      status: "NO_SAFE_ACTION",
      riskLevel,
      selectedCandidate,
      candidates,
      reasoning: "No policy-compliant candidate can restore the target.",
    };
  return {
    action: selectedCandidate.requiresApproval ? "REQUIRE_APPROVAL" : selectedCandidate.type,
    status: selectedCandidate.requiresApproval ? "REQUIRE_APPROVAL" : "READY",
    riskLevel,
    selectedCandidate,
    candidates,
    reasoning: selectedCandidate.requiresApproval
      ? "Minimum effective intervention requires approval; no autonomous execution is authorized."
      : "Selected the smallest autonomous policy-compliant intervention reaching target.",
  };
}
