import { z } from "zod";
import type { CandidateView } from "../product/models";

export const explanationSchema = z.strictObject({
  riskSummary: z.string().min(1).max(500),
  selectionReason: z.string().min(1).max(500),
  policySummary: z.string().min(1).max(500),
  outcomeSummary: z.string().min(1).max(500).nullable(),
  referencedCandidateIds: z.array(z.string().min(1)).max(100),
});
export type ProtectionExplanation = z.infer<typeof explanationSchema>;

export function validateExplanation(input: unknown, allowedCandidateIds: string[]) {
  const value = explanationSchema.parse(input);
  const allowed = new Set(allowedCandidateIds);
  if (value.referencedCandidateIds.some(id => !allowed.has(id))) throw new Error("AI_REFERENCED_UNKNOWN_CANDIDATE");
  return value;
}

export function deterministicExplanation(input: { healthFactor: string | null; target: string; riskLevel: string; candidates: CandidateView[]; selected: CandidateView | null; protectionEnabled: boolean }): ProtectionExplanation {
  const selected = input.selected;
  return {
    riskSummary: input.healthFactor === null ? "The position has no finite health factor to assess." : `The current health factor is ${input.healthFactor}, classified ${input.riskLevel}, against a configured target of ${input.target}.`,
    selectionReason: selected ? `${selected.tokenAmount ?? selected.amount} ${selected.assetSymbol ?? selected.asset} is the smallest evaluated policy-compliant action expected to reach the target.` : "No evaluated action is currently eligible for autonomous execution.",
    policySummary: input.protectionEnabled ? "The saved policy is active and remains authoritative; explanations cannot modify its constraints." : "Protection is disabled, so no autonomous intervention is authorized.",
    outcomeSummary: null,
    referencedCandidateIds: selected ? [selected.id] : [],
  };
}

export async function explainWithFallback(input: Parameters<typeof deterministicExplanation>[0], provider?: (payload: unknown) => Promise<unknown>) {
  if (!provider) return { explanation: deterministicExplanation(input), source: "deterministic" as const };
  try {
    const raw = await provider({ healthFactor: input.healthFactor, target: input.target, riskLevel: input.riskLevel, candidates: input.candidates.map(({ id, state, reason }) => ({ id, state, reason })), selectedCandidateId: input.selected?.id ?? null });
    return { explanation: validateExplanation(raw, input.candidates.map(c => c.id)), source: "ai" as const };
  } catch {
    return { explanation: deterministicExplanation(input), source: "deterministic" as const };
  }
}
