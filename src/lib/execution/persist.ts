import "server-only";
import { createHash } from "node:crypto";
import { getPrisma } from "../db/prisma";
import type { CanonicalPreparation } from "./types";
import type { AavePosition } from "../aave/types";
import type { KeeperHubSimulation } from "../keeperhub/direct-types";
import type { Prisma } from "../../generated/prisma/client";

export function stableExecutionKey(prepared: CanonicalPreparation) { return `pg_${createHash("sha256").update([prepared.walletAddress.toLowerCase(), prepared.chainId, prepared.policyId, prepared.policyUpdatedAt, prepared.intent.action, prepared.intent.asset.toLowerCase(), prepared.intent.amountUnits, prepared.effectFingerprint].join("|")).digest("hex")}`; }
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export async function persistStaleDecision(prepared: CanonicalPreparation, refreshed: CanonicalPreparation | null) {
  const db = getPrisma(); const user = await db.user.findUniqueOrThrow({ where: { walletAddress: prepared.walletAddress.toLowerCase() } });
  await db.auditEvent.create({ data: { userId: user.id, type: "POSITION_CHANGED", severity: "WARNING", message: "Aave position changed after simulation; the stale intervention was cancelled.", metadata: { preparedFingerprint: prepared.effectFingerprint, refreshedFingerprint: refreshed?.effectFingerprint ?? null, preparedAmount: prepared.intent.amountUnits, refreshedAmount: refreshed?.intent.amountUnits ?? null } } });
}

export async function reserveCanonicalExecution(prepared: CanonicalPreparation, simulation: KeeperHubSimulation) {
  const db = getPrisma(), idempotencyKey = stableExecutionKey(prepared);
  const existing = await db.execution.findUnique({ where: { idempotencyKey } }); if (existing) return { execution: existing, idempotencyKey, duplicate: true };
  try {
    const execution = await db.$transaction(async tx => {
      const user = await tx.user.findUniqueOrThrow({ where: { walletAddress: prepared.walletAddress.toLowerCase() } });
      const snapshot = await tx.positionSnapshot.create({ data: { userId: user.id, chainId: prepared.chainId, healthFactor: prepared.position.account.healthFactor, totalCollateralUsd: prepared.position.account.totalCollateralUsd, totalDebtUsd: prepared.position.account.totalDebtUsd, availableBorrowsUsd: prepared.position.account.availableBorrowsUsd, normalizedContext: json(prepared.position.normalizedProtectionInput), capturedAt: new Date(prepared.position.fetchedAt), blockNumber: BigInt(prepared.position.blockNumber), blockHash: prepared.position.blockHash, blockTimestamp: BigInt(prepared.position.blockTimestamp), purpose: "PRE_EXECUTION" } });
      const decision = await tx.protectionDecision.create({ data: { userId: user.id, snapshotId: snapshot.id, riskLevel: prepared.result.riskLevel, selectedAction: prepared.result.action, selectedAsset: prepared.intent.asset, selectedAmount: prepared.candidate.tokenAmount, expectedHealthFactor: prepared.candidate.expectedHealthFactor, reasoning: prepared.result.reasoning, reasoningContext: json({ context: prepared.context, effectFingerprint: prepared.effectFingerprint, snapshotBlock: prepared.position.blockNumber }), policyContext: json({ policyId: prepared.policyId, policyUpdatedAt: prepared.policyUpdatedAt, policy: prepared.policy, intent: prepared.intent, simulation }), status: prepared.result.status, candidates: { create: prepared.result.candidates.map(candidate => ({ type: candidate.type, asset: candidate.assetSymbol ?? candidate.asset, amount: candidate.tokenAmount ?? candidate.amount, estimatedUsdValue: candidate.estimatedUsdValue, expectedHealthFactor: candidate.expectedHealthFactor, valid: candidate.valid, policyValidity: candidate.policyValidity, reachesTarget: candidate.reachesTarget, requiresApproval: candidate.requiresApproval, rejectionReason: candidate.rejectionReason, rank: candidate.rank })) } } });
      return tx.execution.create({ data: { decisionId: decision.id, idempotencyKey, action: prepared.intent.action, asset: prepared.intent.asset, amount: prepared.intent.amountUnits, simulationStatus: "SUCCEEDED", executionStatus: "NOT_STARTED", healthFactorBefore: prepared.position.account.healthFactor } });
    });
    return { execution, idempotencyKey, duplicate: false };
  } catch (error) {
    const duplicate = await db.execution.findUnique({ where: { idempotencyKey } }); if (duplicate) return { execution: duplicate, idempotencyKey, duplicate: true }; throw error;
  }
}

export async function claimExecution(executionId: string) { const result = await getPrisma().execution.updateMany({ where: { id: executionId, executionStatus: "NOT_STARTED" }, data: { executionStatus: "SUBMITTED" } }); return result.count === 1; }
export async function recordBroadcast(executionId: string, value: { keeperHubExecutionId: string; transactionHash?: string; transactionLink?: string }) { await getPrisma().execution.update({ where: { id: executionId }, data: { keeperHubExecutionId: value.keeperHubExecutionId, transactionHash: value.transactionHash, transactionLink: value.transactionLink } }); }
export async function recordUnconfirmed(executionId: string, reason: string, transactionHash?: string | null) { await getPrisma().execution.update({ where: { id: executionId }, data: { executionStatus: "UNCONFIRMED", failureReason: reason, transactionHash: transactionHash ?? undefined } }); }
export async function recordFailed(executionId: string, reason: string) { await getPrisma().execution.update({ where: { id: executionId }, data: { executionStatus: "FAILED", failureReason: reason, completedAt: new Date() } }); }
export async function persistConfirmedExecution(executionId: string, prepared: CanonicalPreparation, post: AavePosition, proof: { transactionHash: string; transactionLink?: string | null }) {
  const db = getPrisma(); await db.$transaction(async tx => { const execution = await tx.execution.update({ where: { id: executionId }, data: { executionStatus: "CONFIRMED", receiptVerified: true, transactionHash: proof.transactionHash, transactionLink: proof.transactionLink ?? undefined, healthFactorAfter: post.account.healthFactor, completedAt: new Date() }, include: { decision: true } });
    await tx.positionSnapshot.create({ data: { userId: execution.decision.userId, chainId: post.chain.chainId, healthFactor: post.account.healthFactor, totalCollateralUsd: post.account.totalCollateralUsd, totalDebtUsd: post.account.totalDebtUsd, availableBorrowsUsd: post.account.availableBorrowsUsd, normalizedContext: json(post.normalizedProtectionInput), capturedAt: new Date(post.fetchedAt), blockNumber: BigInt(post.blockNumber), blockHash: post.blockHash, blockTimestamp: BigInt(post.blockTimestamp), purpose: "POST_EXECUTION" } });
    await tx.protectionDecision.update({ where: { id: execution.decisionId }, data: { status: "COMPLETED" } });
    await tx.auditEvent.createMany({ data: [{ userId: execution.decision.userId, type: "RECEIPT_VERIFIED", severity: "INFO", message: "KeeperHub and RPC receipts verified successfully.", metadata: { executionId, transactionHash: proof.transactionHash } }, { userId: execution.decision.userId, type: "AAVE_EVENT_CONFIRMED", severity: "INFO", message: "Expected Aave protection event confirmed.", metadata: { executionId } }, { userId: execution.decision.userId, type: "HEALTH_FACTOR_IMPROVED", severity: "INFO", message: "Post-execution Aave position was verified.", metadata: { before: prepared.position.account.healthFactor, after: post.account.healthFactor } }] });
  });
}
