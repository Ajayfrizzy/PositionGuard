import "server-only";
import { cache } from "react";
import { getPrisma } from "../db/prisma";
import { shouldShowProtectionAttention } from "./models";
import type { RiskLevel } from "../protection/types";
import {
  mapProtectionIndicator,
  mapMonitoringPresentation,
  mapWorkerHealth,
  type ProtectionIndicator,
  type WorkerStatus,
} from "./status";

export type ShellData = {
  protectionAttention: boolean;
  policyEnabled: boolean;
  monitoringActive: boolean;
  workerStatus: WorkerStatus;
  protectionIndicator: ProtectionIndicator;
};

async function loadShellDataUncached(
  protectedAccountId: string,
  chainId: number,
): Promise<ShellData> {
  try {
    const db = getPrisma();
    const [policy, snapshot, decision, monitoringRun] = await Promise.all([
      db.protectionPolicy.findUnique({
        where: { userId_chainId: { userId: protectedAccountId, chainId } },
        select: {
          enabled: true,
          targetHealthFactor: true,
          warningHealthFactor: true,
          emergencyHealthFactor: true,
        },
      }),
      db.positionSnapshot.findFirst({
        where: { userId: protectedAccountId, chainId },
        orderBy: { capturedAt: "desc" },
        select: { id: true, healthFactor: true },
      }),
      db.protectionDecision.findFirst({
        where: { userId: protectedAccountId },
        orderBy: { createdAt: "desc" },
        select: {
          riskLevel: true,
          status: true,
          snapshotId: true,
          candidates: {
            where: { valid: true },
            select: { id: true },
            take: 1,
          },
        },
      }),
      db.monitoringRun.findFirst({
        where: { userId: protectedAccountId, chainId },
        orderBy: { startedAt: "desc" },
        select: { status: true, completedAt: true },
      }),
    ]);

    let riskLevel: RiskLevel = decision?.riskLevel ?? "SAFE";
    if (snapshot?.healthFactor && policy) {
      const hf = Number(snapshot.healthFactor);
      riskLevel =
        hf >= Number(policy.targetHealthFactor)
          ? "SAFE"
          : hf >= Number(policy.warningHealthFactor)
            ? "WATCH"
            : hf >= Number(policy.emergencyHealthFactor)
              ? "HIGH"
              : "CRITICAL";
    }

    const protectionAttention = shouldShowProtectionAttention({
      policyEnabled: policy?.enabled ?? false,
      riskLevel,
      decisionIsCurrent: Boolean(decision && snapshot && decision.snapshotId === snapshot.id),
      decisionStatus: decision?.status ?? null,
      hasActionableCandidate: Boolean(decision?.candidates.length),
    });
    const worker = mapWorkerHealth({
      enabled: policy?.enabled ?? false,
      lastCheck: monitoringRun?.completedAt ?? null,
      lastRunStatus: monitoringRun?.status ?? null,
      pollingIntervalMs: Math.max(
        30_000,
        Number(process.env.MONITOR_POLL_INTERVAL_MS ?? 60_000) || 60_000,
      ),
    });
    const policyEnabled = policy?.enabled ?? false;
    const monitoring = mapMonitoringPresentation({
      policyEnabled,
      workerStatus: worker.status,
    });
    return {
      protectionAttention,
      policyEnabled,
      monitoringActive: monitoring.active,
      workerStatus: worker.status,
      protectionIndicator: mapProtectionIndicator({
        enabled: policyEnabled,
        workerStatus: worker.status,
        riskLevel,
        attention: protectionAttention,
        blocked: decision?.status === "PROTECTION_BLOCKED",
      }),
    };
  } catch {
    // Shell presentation must never hold navigation hostage to database recovery.
    return {
      protectionAttention: false,
      policyEnabled: false,
      monitoringActive: false,
      workerStatus: "NOT_STARTED",
      protectionIndicator: null,
    };
  }
}

export const loadShellData = cache(loadShellDataUncached);
