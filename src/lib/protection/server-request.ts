import "server-only";
import { z } from "zod";
import { getDefaultChain } from "../chains/config";
import { prepareLiveProtectionAnalysis } from "./live-preparation";
export const protectionExecutionRequestSchema = z.strictObject({
  mode: z.enum(["simulate", "broadcast"]),
});
export function parseProtectionExecutionRequest(input: unknown) {
  return protectionExecutionRequestSchema.parse(input);
}
export async function recomputeCanonicalIntervention() {
  const walletAddress = process.env.AAVE_WALLET_ADDRESS;
  if (!walletAddress) throw new Error("PROTECTED_WALLET_NOT_CONFIGURED");
  const chain = getDefaultChain();
  const prepared = await prepareLiveProtectionAnalysis({ walletAddress, chainId: chain.chainId });
  if (prepared.analysis.result.status !== "READY" || !prepared.analysis.result.selectedCandidate)
    throw new Error("NO_CANONICAL_INTERVENTION_READY");
  return Object.freeze({
    policyId: prepared.policyId,
    snapshotBlock: prepared.position.blockNumber,
    candidate: prepared.analysis.result.selectedCandidate,
  });
}
