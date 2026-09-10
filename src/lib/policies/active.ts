import "server-only";
import { getChain } from "../chains/config";
import { getPrisma } from "../db/prisma";
import { walletSchema } from "../security/position-input";
import { validatePolicy } from "./validator";
import type { ProtectionPolicy } from "./types";

interface StoredPolicy {
  id: string;
  targetHealthFactor: { toString(): string };
  warningHealthFactor: { toString(): string };
  emergencyHealthFactor: { toString(): string };
  maxAutonomousAmountUsd: { toString(): string };
  maxDailyAutonomousAmountUsd: { toString(): string };
  approvalRequiredAboveUsd: { toString(): string };
  allowRepay: boolean;
  allowAddCollateral: boolean;
  interventionCooldownMinutes: number;
  enabled: boolean;
  updatedAt: Date;
}

export interface ActivePolicyStore {
  protectionPolicy: {
    findFirst(args: {
      where: { chainId: number; user: { walletAddress: string } };
    }): Promise<StoredPolicy | null>;
  };
}

export class ActivePolicyError extends Error {
  constructor(public readonly code: "ACTIVE_POLICY_NOT_FOUND" | "ACTIVE_POLICY_DISABLED") {
    super(code);
    this.name = "ActivePolicyError";
  }
}

export async function loadActiveProtectionPolicy(
  input: { walletAddress: string; chainId: number },
  store: ActivePolicyStore = getPrisma(),
): Promise<{ policyId: string; policyUpdatedAt: string; policy: ProtectionPolicy }> {
  const wallet = walletSchema.parse(input.walletAddress);
  const chain = getChain(input.chainId);
  const row = await store.protectionPolicy.findFirst({
    where: { chainId: chain.chainId, user: { walletAddress: wallet.toLowerCase() } },
  });
  if (!row) throw new ActivePolicyError("ACTIVE_POLICY_NOT_FOUND");
  if (!row.enabled) throw new ActivePolicyError("ACTIVE_POLICY_DISABLED");
  const policy = validatePolicy({
    targetHealthFactor: row.targetHealthFactor.toString(),
    warningHealthFactor: row.warningHealthFactor.toString(),
    emergencyHealthFactor: row.emergencyHealthFactor.toString(),
    maxAutonomousAmountUsd: row.maxAutonomousAmountUsd.toString(),
    maxDailyAutonomousAmountUsd: row.maxDailyAutonomousAmountUsd.toString(),
    approvalRequiredAboveUsd: row.approvalRequiredAboveUsd.toString(),
    allowRepay: row.allowRepay,
    allowAddCollateral: row.allowAddCollateral,
    interventionCooldownMinutes: row.interventionCooldownMinutes,
    enabled: row.enabled,
  });
  return { policyId: row.id, policyUpdatedAt: row.updatedAt.toISOString(), policy };
}
