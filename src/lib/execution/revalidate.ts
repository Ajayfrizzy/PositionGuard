import "server-only";
import type { CanonicalPreparation } from "./types";
import { prepareCanonicalProtection, type PreparationDependencies } from "./prepare";
export async function revalidateCanonicalPreparation(prepared: CanonicalPreparation, dependencies?: PreparationDependencies) {
  try { const refreshed = await prepareCanonicalProtection(dependencies); const unchanged = prepared.policyId === refreshed.policyId && prepared.policyUpdatedAt === refreshed.policyUpdatedAt && prepared.effectFingerprint === refreshed.effectFingerprint && prepared.intent.amountUnits === refreshed.intent.amountUnits; return { unchanged, refreshed }; }
  catch (error) { if (error instanceof Error && error.message === "NO_CANONICAL_INTERVENTION_READY") return { unchanged: false, refreshed: null }; throw error; }
}
