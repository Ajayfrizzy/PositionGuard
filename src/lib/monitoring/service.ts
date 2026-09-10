import "server-only";
import { getDefaultChain } from "../chains/config";
import { getPrisma } from "../db/prisma";
import { prepareLiveProtectionAnalysis } from "../protection/live-preparation";
import { persistPositionSnapshot } from "../aave/snapshots";
type PreparedMonitoring = Awaited<ReturnType<typeof prepareLiveProtectionAnalysis>>;
export interface MonitoringDependencies { prepare: typeof prepareLiveProtectionAnalysis; persist(prepared: PreparedMonitoring, walletAddress: string): Promise<{ snapshotId: string; decisionId: string | null; riskLevel: string; status: string }> }
async function persistMonitoringResult(prepared: PreparedMonitoring, walletAddress: string) {
  const snapshotId = await persistPositionSnapshot(prepared.position, prepared.analysis); const db = getPrisma(); const user = await db.user.findUniqueOrThrow({ where: { walletAddress: walletAddress.toLowerCase() } }); const result = prepared.analysis.result;
  if (result.riskLevel === "SAFE") { await db.auditEvent.create({ data: { userId: user.id, type: "POSITION_MONITORED", severity: "INFO", message: "Position snapshot captured; no intervention required.", metadata: { snapshotId, blockNumber: prepared.position.blockNumber, healthFactor: prepared.position.account.healthFactor } } }); return { snapshotId, decisionId: null, riskLevel: result.riskLevel, status: result.status }; }
  const policyContext = JSON.parse(JSON.stringify(prepared.policy)) as Record<string, string | boolean | number>;
  const decision = await db.protectionDecision.create({ data: { userId: user.id, snapshotId, riskLevel: result.riskLevel, selectedAction: result.action, selectedAsset: result.selectedCandidate?.assetSymbol ?? result.selectedCandidate?.asset, selectedAmount: result.selectedCandidate?.tokenAmount ?? result.selectedCandidate?.amount, expectedHealthFactor: result.selectedCandidate?.expectedHealthFactor, reasoning: result.reasoning, reasoningContext: { candidateCount: result.candidates.length, authoritativeEngine: "deterministic" }, policyContext, status: result.status, candidates: { create: result.candidates.map(candidate => ({ type: candidate.type, asset: candidate.assetSymbol ?? candidate.asset, amount: candidate.tokenAmount ?? candidate.amount, estimatedUsdValue: candidate.estimatedUsdValue, expectedHealthFactor: candidate.expectedHealthFactor, valid: candidate.valid, policyValidity: candidate.policyValidity, reachesTarget: candidate.reachesTarget, requiresApproval: candidate.requiresApproval, rejectionReason: candidate.rejectionReason, rank: candidate.rank })) } } });
  await db.auditEvent.createMany({ data: [{ userId: user.id, type: "RISK_THRESHOLD_CROSSED", severity: result.riskLevel === "CRITICAL" ? "ERROR" : "WARNING", message: `${result.riskLevel} risk detected at health factor ${prepared.position.account.healthFactor ?? "unbounded"}.`, metadata: { snapshotId } }, { userId: user.id, type: "CANDIDATES_EVALUATED", severity: "INFO", message: `${result.candidates.length} protection candidates evaluated.`, metadata: { decisionId: decision.id } }, { userId: user.id, type: "MEI_SELECTED", severity: "INFO", message: result.selectedCandidate ? "Minimum Effective Intervention selected." : "No safe intervention was available.", metadata: { decisionId: decision.id, candidateId: result.selectedCandidate?.id ?? null } }] });
  return { snapshotId, decisionId: decision.id, riskLevel: result.riskLevel, status: result.status };
}
const defaults: MonitoringDependencies = { prepare: prepareLiveProtectionAnalysis, persist: persistMonitoringResult };
export async function runMonitoringCycle(dependencies: MonitoringDependencies = defaults) {
  const walletAddress = process.env.AAVE_WALLET_ADDRESS; if (!walletAddress) throw new Error("PROTECTED_WALLET_NOT_CONFIGURED");
  const chain = getDefaultChain(); const prepared = await dependencies.prepare({ walletAddress, chainId: chain.chainId });
  return dependencies.persist(prepared, walletAddress);
}
