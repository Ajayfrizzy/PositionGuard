import "server-only";
import { cache } from "react";
import { getPrisma } from "../db/prisma";
import { shouldShowProtectionAttention } from "./models";
import type { RiskLevel } from "../protection/types";

export type ShellData = { protectionAttention: boolean };

async function loadShellDataUncached(
  protectedAccountId: string,
  chainId: number,
): Promise<ShellData> {
  try {
    const db = getPrisma();
    const [policy, snapshot, decision] = await Promise.all([
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

    return {
      protectionAttention: shouldShowProtectionAttention({
        policyEnabled: policy?.enabled ?? false,
        riskLevel,
        decisionIsCurrent: Boolean(decision && snapshot && decision.snapshotId === snapshot.id),
        decisionStatus: decision?.status ?? null,
        hasActionableCandidate: Boolean(decision?.candidates.length),
      }),
    };
  } catch {
    // Shell presentation must never hold navigation hostage to database recovery.
    return { protectionAttention: false };
  }
}

export const loadShellData = cache(loadShellDataUncached);
