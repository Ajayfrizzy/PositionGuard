import { z } from "zod";
import type { CandidateView } from "../product/models";

export const explanationSchema = z.strictObject({
  riskSummary: z.string().min(1).max(500),
  selectionReason: z.string().min(1).max(500),
  policySummary: z.string().min(1).max(500),
  outcomeSummary: z.string().min(1).max(500).nullable(),
  referencedCandidateIds: z.array(z.string().min(1)).max(100),
  whyRiskChanged: z.string().min(1).max(500).optional(),
  whyThisAction: z.string().min(1).max(500).optional(),
  rejectedReasons: z
    .array(z.strictObject({ candidateId: z.string().min(1), reason: z.string().min(1).max(300) }))
    .max(20)
    .optional(),
  whatHappensNext: z.string().min(1).max(500).optional(),
});
export type ProtectionExplanation = z.infer<typeof explanationSchema>;

export function validateExplanation(input: unknown, allowedCandidateIds: string[]) {
  const value = explanationSchema.parse(input);
  const allowed = new Set(allowedCandidateIds);
  if (value.referencedCandidateIds.some((id) => !allowed.has(id)))
    throw new Error("AI_REFERENCED_UNKNOWN_CANDIDATE");
  if (value.rejectedReasons?.some((item) => !allowed.has(item.candidateId)))
    throw new Error("AI_REFERENCED_UNKNOWN_CANDIDATE");
  return value;
}

export function deterministicExplanation(input: {
  healthFactor: string | null;
  target: string;
  riskLevel: string;
  candidates: CandidateView[];
  selected: CandidateView | null;
  protectionEnabled: boolean;
}): ProtectionExplanation {
  const selected = input.selected;
  return {
    riskSummary:
      input.healthFactor === null
        ? "The position has no finite health factor to assess."
        : `The current health factor is ${input.healthFactor}, classified ${input.riskLevel}, against a configured target of ${input.target}.`,
    selectionReason: selected
      ? `${selected.tokenAmount ?? selected.amount} ${selected.assetSymbol ?? selected.asset} is the smallest evaluated policy-compliant action expected to reach the target.`
      : "No evaluated action is currently eligible for autonomous execution.",
    policySummary: input.protectionEnabled
      ? "The saved policy is active and remains authoritative; explanations cannot modify its constraints."
      : "Protection is disabled, so no autonomous intervention is authorized.",
    outcomeSummary: null,
    referencedCandidateIds: selected ? [selected.id] : [],
    whyRiskChanged:
      input.healthFactor === null
        ? "No active debt creates an unbounded health factor."
        : `Your health factor is ${input.healthFactor}, below the configured safety target of ${input.target}.`,
    whyThisAction: selected
      ? `${selected.tokenAmount ?? selected.amount} ${selected.assetSymbol ?? selected.asset} is the Minimum Effective Intervention selected by the deterministic engine.`
      : "No action passed every policy and readiness check.",
    rejectedReasons: input.candidates
      .filter((candidate) => candidate.id !== selected?.id)
      .slice(0, 5)
      .map((candidate) => ({ candidateId: candidate.id, reason: candidate.reason })),
    whatHappensNext: input.protectionEnabled
      ? "PositionGuard will verify funding, simulate the action, and re-read Aave state before any authorized broadcast."
      : "Enable protection after reviewing your mode, limits, and funding readiness.",
  };
}

export async function explainWithFallback(
  input: Parameters<typeof deterministicExplanation>[0],
  provider?: (payload: unknown) => Promise<unknown>,
) {
  if (!provider)
    return { explanation: deterministicExplanation(input), source: "deterministic" as const };
  try {
    const raw = await Promise.race([
      provider({
        healthFactor: input.healthFactor,
        target: input.target,
        riskLevel: input.riskLevel,
        candidates: input.candidates.map(
          ({
            id,
            state,
            reason,
            asset,
            assetSymbol,
            amount,
            tokenAmount,
            expectedHealthFactor,
          }) => ({
            id,
            state,
            reason,
            asset: assetSymbol ?? asset,
            amount: tokenAmount ?? amount,
            expectedHealthFactor,
          }),
        ),
        selectedCandidateId: input.selected?.id ?? null,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AI_PROVIDER_TIMEOUT")), 4_000),
      ),
    ]);
    return {
      explanation: validateExplanation(
        raw,
        input.candidates.map((c) => c.id),
      ),
      source: "ai" as const,
    };
  } catch {
    return { explanation: deterministicExplanation(input), source: "deterministic" as const };
  }
}

export function postExecutionExplanation(input: {
  amount: string;
  asset: string;
  healthFactorBefore: string | null;
  healthFactorAfter: string | null;
  status: string;
}) {
  return input.status === "CONFIRMED"
    ? `${input.amount} ${input.asset} was applied. Your health factor improved from ${input.healthFactorBefore ?? "unavailable"} to ${input.healthFactorAfter ?? "unavailable"}. The receipt and Aave post-state were verified.`
    : `The ${input.asset} protection action is ${input.status.toLowerCase()}. No successful outcome is claimed until its receipt and Aave post-state are verified.`;
}
