import "server-only";
import { getDefaultChain } from "../chains/config";
import { getPrisma } from "../db/prisma";
import { getAavePosition } from "../aave/service";
import { loadActiveProtectionPolicy } from "../policies/active";
import { evaluateProtection } from "../protection/protection-engine";
import { buildAaveRepayIntent, buildAaveSupplyIntent, aaveIntentFingerprint } from "../aave/intents";
import { assetSymbolSchema } from "../chains/assets";
import type { PolicyContext } from "../policies/types";
import type { CanonicalPreparation } from "./types";

export interface PreparationDependencies { loadPolicy: typeof loadActiveProtectionPolicy; readPosition: typeof getAavePosition; loadContext(input: { walletAddress: string; chainId: number; nowMs: number }): Promise<PolicyContext> }
export async function loadExecutionPolicyContext(input: { walletAddress: string; chainId: number; nowMs: number }): Promise<PolicyContext> {
  const db = getPrisma(), since = new Date(input.nowMs - 86_400_000);
  const rows = await db.execution.findMany({ where: { createdAt: { gte: since }, executionStatus: { in: ["SUBMITTED", "CONFIRMED", "UNCONFIRMED"] }, decision: { user: { walletAddress: input.walletAddress.toLowerCase() }, snapshot: { chainId: input.chainId } } }, include: { decision: { include: { candidates: true } } }, orderBy: { createdAt: "desc" } });
  let spend = 0; for (const row of rows) { const match = row.decision.candidates.find(candidate => candidate.type === row.action && candidate.asset.toLowerCase() === row.asset.toLowerCase() && candidate.amount.toString() === row.decision.selectedAmount?.toString()); spend += Number(match?.estimatedUsdValue.toString() ?? 0); }
  return { dailyAutonomousSpendUsd: spend.toFixed(6), nowMs: input.nowMs, lastAutonomousExecutionAtMs: rows[0]?.createdAt.getTime() ?? null };
}
const defaults: PreparationDependencies = { loadPolicy: loadActiveProtectionPolicy, readPosition: getAavePosition, loadContext: loadExecutionPolicyContext };
export async function prepareCanonicalProtection(dependencies: PreparationDependencies = defaults): Promise<CanonicalPreparation> {
  const walletAddress = process.env.AAVE_WALLET_ADDRESS; if (!walletAddress) throw new Error("PROTECTED_WALLET_NOT_CONFIGURED"); const chain = getDefaultChain();
  const active = await dependencies.loadPolicy({ walletAddress, chainId: chain.chainId });
  const position = await dependencies.readPosition({ walletAddress, chainId: chain.chainId });
  const context = await dependencies.loadContext({ walletAddress, chainId: chain.chainId, nowMs: Date.parse(position.fetchedAt) });
  const result = evaluateProtection(position.normalizedProtectionInput, active.policy, context); const candidate = result.selectedCandidate;
  if (result.status !== "READY" || !candidate || !candidate.tokenAmount || !candidate.assetSymbol) throw new Error("NO_CANONICAL_INTERVENTION_READY");
  const assetSymbol = assetSymbolSchema.parse(candidate.assetSymbol); const sender = process.env.KEEPERHUB_EXECUTION_WALLET; if (!sender) throw new Error("KEEPERHUB_EXECUTION_WALLET_REQUIRED");
  const input = { chainId: chain.chainId, assetSymbol, amount: candidate.tokenAmount, beneficiary: walletAddress, sender };
  const intent = candidate.type === "REPAY_DEBT" ? buildAaveRepayIntent(input) : buildAaveSupplyIntent(input);
  return { walletAddress, chainId: chain.chainId, ...active, context, position, result, candidate, intent, effectFingerprint: aaveIntentFingerprint(intent) };
}
