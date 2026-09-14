import "server-only";
import { getDefaultChain } from "../chains/config";
import { getPrisma } from "../db/prisma";
import { prepareLiveProtectionAnalysis } from "../protection/live-preparation";
import { persistPositionSnapshot } from "../aave/snapshots";
import {
  assessFundingReadiness,
  selectExecutableCandidate,
  type FundingReadiness,
} from "../funding/readiness";
import { executeAutonomousProtection, executeProtection } from "../execution/orchestrator";
import { notify } from "../notifications/service";
import {
  actionNotificationIdentity,
  shouldNotifyBlocker,
  shouldNotifyRecovery,
  shouldNotifyRisk,
  type NotificationState,
} from "../notifications/transitions";
import type { ProtectionExecutionResult } from "../execution/types";
import type { Prisma } from "../../generated/prisma/client";
import { executionDisposition } from "../policies/execution-mode";
type PreparedMonitoring = Awaited<ReturnType<typeof prepareLiveProtectionAnalysis>>;
export interface MonitoringDependencies {
  prepare: typeof prepareLiveProtectionAnalysis;
  persist(
    prepared: PreparedMonitoring,
    walletAddress: string,
  ): Promise<{ snapshotId: string; decisionId: string | null; riskLevel: string; status: string }>;
}
async function persistMonitoringResult(prepared: PreparedMonitoring, walletAddress: string) {
  const snapshotId = await persistPositionSnapshot(prepared.position, prepared.analysis);
  const db = getPrisma();
  const user = await db.user.findUniqueOrThrow({
    where: { walletAddress: walletAddress.toLowerCase() },
  });
  const result = prepared.analysis.result;
  if (result.riskLevel === "SAFE") {
    await db.auditEvent.create({
      data: {
        userId: user.id,
        type: "POSITION_MONITORED",
        severity: "INFO",
        message: "Position snapshot captured; no intervention required.",
        metadata: {
          snapshotId,
          blockNumber: prepared.position.blockNumber,
          healthFactor: prepared.position.account.healthFactor,
        },
      },
    });
    return { snapshotId, decisionId: null, riskLevel: result.riskLevel, status: result.status };
  }
  const policyContext = JSON.parse(JSON.stringify(prepared.policy)) as Record<
    string,
    string | boolean | number
  >;
  const decision = await db.protectionDecision.create({
    data: {
      userId: user.id,
      snapshotId,
      riskLevel: result.riskLevel,
      selectedAction: result.action,
      selectedAsset: result.selectedCandidate?.assetSymbol ?? result.selectedCandidate?.asset,
      selectedAmount: result.selectedCandidate?.tokenAmount ?? result.selectedCandidate?.amount,
      expectedHealthFactor: result.selectedCandidate?.expectedHealthFactor,
      reasoning: result.reasoning,
      reasoningContext: {
        candidateCount: result.candidates.length,
        authoritativeEngine: "deterministic",
      },
      policyContext,
      status: result.status,
      candidates: {
        create: result.candidates.map((candidate) => ({
          type: candidate.type,
          asset: candidate.assetSymbol ?? candidate.asset,
          amount: candidate.tokenAmount ?? candidate.amount,
          estimatedUsdValue: candidate.estimatedUsdValue,
          expectedHealthFactor: candidate.expectedHealthFactor,
          valid: candidate.valid,
          policyValidity: candidate.policyValidity,
          reachesTarget: candidate.reachesTarget,
          requiresApproval: candidate.requiresApproval,
          rejectionReason: candidate.rejectionReason,
          rank: candidate.rank,
        })),
      },
    },
  });
  await db.auditEvent.createMany({
    data: [
      {
        userId: user.id,
        type: "RISK_THRESHOLD_CROSSED",
        severity: result.riskLevel === "CRITICAL" ? "ERROR" : "WARNING",
        message: `${result.riskLevel} risk detected at health factor ${prepared.position.account.healthFactor ?? "unbounded"}.`,
        metadata: { snapshotId },
      },
      {
        userId: user.id,
        type: "CANDIDATES_EVALUATED",
        severity: "INFO",
        message: `${result.candidates.length} protection candidates evaluated.`,
        metadata: { decisionId: decision.id },
      },
      {
        userId: user.id,
        type: "MEI_SELECTED",
        severity: "INFO",
        message: result.selectedCandidate
          ? "Minimum Effective Intervention selected."
          : "No safe intervention was available.",
        metadata: { decisionId: decision.id, candidateId: result.selectedCandidate?.id ?? null },
      },
    ],
  });
  return {
    snapshotId,
    decisionId: decision.id,
    riskLevel: result.riskLevel,
    status: result.status,
  };
}
const defaults: MonitoringDependencies = {
  prepare: prepareLiveProtectionAnalysis,
  persist: persistMonitoringResult,
};
export async function runMonitoringCycle(dependencies: MonitoringDependencies = defaults) {
  const walletAddress = process.env.AAVE_WALLET_ADDRESS;
  if (!walletAddress) throw new Error("PROTECTED_WALLET_NOT_CONFIGURED");
  const chain = getDefaultChain();
  const prepared = await dependencies.prepare({ walletAddress, chainId: chain.chainId });
  return dependencies.persist(prepared, walletAddress);
}

export interface ProtectedAccountTarget {
  protectedAccountId: string;
  walletAddress: string;
  chainId: number;
  policyId: string;
  executionMode: "MONITOR_ONLY" | "REQUIRE_APPROVAL" | "AUTONOMOUS";
}
export interface AutonomousMonitoringDependencies {
  prepare: typeof prepareLiveProtectionAnalysis;
  persist: MonitoringDependencies["persist"];
  readiness: typeof assessFundingReadiness;
  selectCandidate: typeof selectExecutableCandidate;
  simulate(input: {
    mode: "simulate";
    walletAddress: string;
    chainId: number;
    candidateId?: string;
  }): Promise<ProtectionExecutionResult>;
  execute(input: {
    walletAddress: string;
    chainId: number;
    candidateId?: string;
  }): Promise<ProtectionExecutionResult>;
}
const autonomousDefaults: AutonomousMonitoringDependencies = {
  prepare: prepareLiveProtectionAnalysis,
  persist: persistMonitoringResult,
  readiness: assessFundingReadiness,
  selectCandidate: selectExecutableCandidate,
  simulate: (input) => executeProtection(input),
  execute: (input) => executeAutonomousProtection(input),
};

const blockerFor = (state: string | null) =>
  ({
    INSUFFICIENT_BALANCE: "INSUFFICIENT_FUNDING",
    INSUFFICIENT_ALLOWANCE: "ALLOWANCE_REQUIRED",
    SENDER_MISMATCH: "SENDER_MISMATCH",
    KEEPERHUB_UNAVAILABLE: "KEEPERHUB_UNAVAILABLE",
    UNSUPPORTED_ASSET: "UNSUPPORTED_ASSET",
  })[state ?? ""] ?? "POLICY_REJECTED";
async function safeNotify(event: Parameters<typeof notify>[0]) {
  try {
    await notify(event);
  } catch (error) {
    console.error(
      "NOTIFICATION_PERSIST_FAILED",
      error instanceof Error ? error.message : "unknown",
    );
  }
}

async function previousNotificationState(
  userId: string,
  chainId: number,
  currentRunId: string,
): Promise<NotificationState> {
  const db = getPrisma();
  const previousRun = await db.monitoringRun.findFirst({
    where: {
      userId,
      chainId,
      id: { not: currentRunId },
      completedAt: { not: null },
      snapshotId: { not: null },
    },
    orderBy: { startedAt: "desc" },
  });
  if (!previousRun)
    return { riskLevel: null, blockerReason: null, actionIdentity: null, approvalPending: false };
  if (!previousRun.decisionId)
    return { riskLevel: "SAFE", blockerReason: null, actionIdentity: null, approvalPending: false };
  const decision = await db.protectionDecision.findUnique({
    where: { id: previousRun.decisionId },
    select: {
      riskLevel: true,
      status: true,
      blockerReason: true,
      selectedAction: true,
      selectedAsset: true,
      selectedAmount: true,
    },
  });
  if (!decision)
    return { riskLevel: null, blockerReason: null, actionIdentity: null, approvalPending: false };
  const actionIdentity =
    decision.selectedAction && decision.selectedAsset && decision.selectedAmount
      ? actionNotificationIdentity({
          type: decision.selectedAction,
          asset: decision.selectedAsset,
          amount: decision.selectedAmount.toString(),
        })
      : null;
  return {
    riskLevel: decision.riskLevel,
    blockerReason: decision.status === "PROTECTION_BLOCKED" ? decision.blockerReason : null,
    actionIdentity,
    approvalPending: previousRun.status === "READY_TO_EXECUTE",
  };
}

export async function runProtectedAccountCycle(
  target: ProtectedAccountTarget,
  dependencies: AutonomousMonitoringDependencies = autonomousDefaults,
) {
  const db = getPrisma();
  const run = await db.monitoringRun.create({
    data: { userId: target.protectedAccountId, chainId: target.chainId, status: "RUNNING" },
  });
  try {
    const previousState = await previousNotificationState(
      target.protectedAccountId,
      target.chainId,
      run.id,
    );
    const prepared = await dependencies.prepare({
      walletAddress: target.walletAddress,
      chainId: target.chainId,
    });
    const persisted = await dependencies.persist(prepared, target.walletAddress);
    const result = prepared.analysis.result;
    let readiness: FundingReadiness | null = null,
      execution: ProtectionExecutionResult | null = null,
      blockerReason: string | null = null;
    if (shouldNotifyRecovery(previousState, result.riskLevel)) {
      await safeNotify({
        userId: target.protectedAccountId,
        type: "POSITION_CHANGED",
        title: "Position returned to safe range",
        message: "Your health factor is back within the configured safety range.",
        dedupeKey: `${target.protectedAccountId}:${target.chainId}:recovery:${run.id}`,
        metadata: { snapshotId: persisted.snapshotId },
      });
    }
    if (result.riskLevel !== "SAFE") {
      if (shouldNotifyRisk(previousState, result.riskLevel))
        await safeNotify({
          userId: target.protectedAccountId,
          type: `RISK_${result.riskLevel}` as "RISK_WATCH" | "RISK_HIGH" | "RISK_CRITICAL",
          title: `${result.riskLevel} position risk`,
          message: `Health factor ${prepared.position.account.healthFactor ?? "unbounded"} requires attention.`,
          dedupeKey: `${target.protectedAccountId}:${target.chainId}:risk:${result.riskLevel}:${run.id}`,
          metadata: { decisionId: persisted.decisionId },
        });
      const selectedActionIdentity = result.selectedCandidate
        ? actionNotificationIdentity({
            type: result.selectedCandidate.type,
            asset: result.selectedCandidate.assetSymbol ?? result.selectedCandidate.asset,
            amount: result.selectedCandidate.tokenAmount ?? result.selectedCandidate.amount,
          })
        : null;
      if (result.selectedCandidate && selectedActionIdentity !== previousState.actionIdentity)
        await safeNotify({
          userId: target.protectedAccountId,
          type: "MEI_SELECTED",
          title: "Minimum intervention selected",
          message: `${result.selectedCandidate.type} ${result.selectedCandidate.tokenAmount ?? result.selectedCandidate.amount} ${result.selectedCandidate.assetSymbol ?? result.selectedCandidate.asset}.`,
          dedupeKey: `${target.protectedAccountId}:${target.chainId}:mei:${persisted.decisionId ?? run.id}:${selectedActionIdentity}`,
          metadata: { decisionId: persisted.decisionId, actionIdentity: selectedActionIdentity },
        });
    }
    if (result.riskLevel !== "SAFE" && target.executionMode !== "MONITOR_ONLY") {
      const selected = await dependencies.selectCandidate(
        {
          chainId: target.chainId,
          candidates: result.candidates,
          allowApproval: target.executionMode === "REQUIRE_APPROVAL",
        },
        dependencies.readiness,
      );
      readiness = selected.readiness;
      const disposition = executionDisposition({
        mode: target.executionMode,
        actionable: Boolean(selected.candidate),
        ready: readiness?.state === "READY",
      });
      if (disposition === "BLOCK") blockerReason = blockerFor(readiness?.state ?? null);
      else if (disposition === "SIMULATE" && selected.candidate) {
        execution = await dependencies.simulate({
          mode: "simulate",
          walletAddress: target.walletAddress,
          chainId: target.chainId,
          candidateId: selected.candidate.id,
        });
        const approvalActionIdentity = actionNotificationIdentity({
          type: selected.candidate.type,
          asset: selected.candidate.assetSymbol ?? selected.candidate.asset,
          amount: selected.candidate.tokenAmount ?? selected.candidate.amount,
        });
        if (
          !previousState.approvalPending ||
          previousState.actionIdentity !== approvalActionIdentity
        )
          await safeNotify({
            userId: target.protectedAccountId,
            type: "APPROVAL_REQUIRED",
            title: "Your approval is required",
            message: "A protection action passed simulation and is waiting for your approval.",
            dedupeKey: `${target.protectedAccountId}:${target.chainId}:approval:${persisted.decisionId ?? run.id}:${approvalActionIdentity}`,
            metadata: {
              candidateId: selected.candidate.id,
              actionIdentity: approvalActionIdentity,
            },
          });
      } else if (disposition === "EXECUTE" && selected.candidate) {
        await safeNotify({
          userId: target.protectedAccountId,
          type: "EXECUTION_STARTED",
          title: "Autonomous protection started",
          message: "All preflight readiness checks passed.",
          dedupeKey: `${target.protectedAccountId}:${target.chainId}:execution:${run.id}:${selected.candidate.id}:started`,
        });
        try {
          execution = await dependencies.execute({
            walletAddress: target.walletAddress,
            chainId: target.chainId,
            candidateId: selected.candidate.id,
          });
          if (execution.outcome === "CONFIRMED")
            await safeNotify({
              userId: target.protectedAccountId,
              type: "EXECUTION_CONFIRMED",
              title: "Protection confirmed",
              message: "The Aave intervention and post-state were verified.",
              dedupeKey: `${target.protectedAccountId}:${target.chainId}:execution:${execution.idempotencyKey ?? selected.candidate.id}:confirmed`,
              metadata: { transactionHash: execution.transactionHash },
            });
          else if (execution.outcome === "POSITION_CHANGED") blockerReason = "STALE_POSITION";
        } catch (error) {
          const code = error instanceof Error ? error.message : "EXECUTION_FAILED";
          blockerReason = code.includes("SIMULATION") ? "SIMULATION_FAILED" : code;
          await safeNotify({
            userId: target.protectedAccountId,
            type: "EXECUTION_FAILED",
            title: "Protection execution failed",
            message: blockerReason,
            dedupeKey: `${target.protectedAccountId}:${target.chainId}:execution:${run.id}:${selected.candidate.id}:failed:${blockerReason}`,
          });
        }
      }
    }
    const fundingReadinessContext = readiness
      ? { ...readiness, checkedAt: new Date().toISOString() }
      : null;
    if (result.riskLevel !== "SAFE" && (result.status === "NO_SAFE_ACTION" || blockerReason)) {
      blockerReason ??= "POLICY_REJECTED";
      if (persisted.decisionId)
        await db.protectionDecision.update({
          where: { id: persisted.decisionId },
          data: {
            status: "PROTECTION_BLOCKED",
            blockerReason,
            fundingReadiness: readiness?.state,
            fundingReadinessContext: fundingReadinessContext
              ? JSON.parse(JSON.stringify(fundingReadinessContext))
              : undefined,
          },
        });
      await db.auditEvent.create({
        data: {
          userId: target.protectedAccountId,
          type: "PROTECTION_BLOCKED",
          severity: "ERROR",
          message: `Protection could not proceed: ${blockerReason}.`,
          metadata: JSON.parse(
            JSON.stringify({ decisionId: persisted.decisionId, blockerReason, readiness }),
          ) as Prisma.InputJsonValue,
        },
      });
      if (shouldNotifyBlocker(previousState, blockerReason))
        await safeNotify({
          userId: target.protectedAccountId,
          type: "PROTECTION_BLOCKED",
          title: "Protection blocked",
          message: blockerReason,
          dedupeKey: `${target.protectedAccountId}:${target.chainId}:blocked:${blockerReason}:${run.id}`,
          metadata: { decisionId: persisted.decisionId, readiness },
        });
    } else if (persisted.decisionId && readiness) {
      await db.protectionDecision.update({
        where: { id: persisted.decisionId },
        data: {
          fundingReadiness: readiness.state,
          fundingReadinessContext: JSON.parse(JSON.stringify(fundingReadinessContext)),
        },
      });
    }
    const status = blockerReason
      ? "PROTECTION_BLOCKED"
      : (execution?.outcome ??
        (target.executionMode === "MONITOR_ONLY" ? "MONITORED" : result.status));
    await db.monitoringRun.update({
      where: { id: run.id },
      data: {
        status,
        completedAt: new Date(),
        snapshotId: persisted.snapshotId,
        decisionId: persisted.decisionId,
        executionOutcome: execution?.outcome,
      },
    });
    return {
      ...persisted,
      protectedAccountId: target.protectedAccountId,
      executionMode: target.executionMode,
      readiness,
      blockerReason,
      execution,
      monitoringStatus: status,
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : "MONITORING_CYCLE_FAILED";
    await db.monitoringRun.update({
      where: { id: run.id },
      data: { status: "FAILED", completedAt: new Date(), errorCode: code.slice(0, 200) },
    });
    await db.auditEvent.create({
      data: {
        userId: target.protectedAccountId,
        type: "MONITORING_FAILED",
        severity: "ERROR",
        message: "Monitoring cycle failed safely.",
        metadata: { code },
      },
    });
    throw error;
  }
}

export async function loadEnabledProtectedAccounts(): Promise<ProtectedAccountTarget[]> {
  const rows = await getPrisma().protectionPolicy.findMany({
    where: { enabled: true },
    include: { user: true },
    orderBy: { updatedAt: "asc" },
  });
  return rows.map((row) => ({
    protectedAccountId: row.userId,
    walletAddress: row.user.walletAddress,
    chainId: row.chainId,
    policyId: row.id,
    executionMode: row.executionMode,
  }));
}

export async function runAllMonitoringCycles(
  dependencies: {
    load?: typeof loadEnabledProtectedAccounts;
    run?: typeof runProtectedAccountCycle;
  } = {},
) {
  const targets = await (dependencies.load ?? loadEnabledProtectedAccounts)();
  const results = [];
  for (const target of targets) {
    try {
      results.push({
        ok: true as const,
        target,
        result: await (dependencies.run ?? runProtectedAccountCycle)(target),
      });
    } catch (error) {
      results.push({
        ok: false as const,
        target,
        error: error instanceof Error ? error.message : "MONITORING_CYCLE_FAILED",
      });
    }
  }
  return results;
}
