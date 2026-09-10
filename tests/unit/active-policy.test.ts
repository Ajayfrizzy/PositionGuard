import { describe, expect, it, vi } from "vitest";
import { baseSepoliaConfig } from "../../src/lib/chains/config";
import { loadActiveProtectionPolicy, type ActivePolicyStore } from "../../src/lib/policies/active";
import { prepareLiveProtectionAnalysis } from "../../src/lib/protection/live-preparation";
import { getAavePosition } from "../../src/lib/aave/service";
import { previewPolicy } from "../../src/lib/aave/analysis";
import { readerFor, reserves, wallet } from "../fixtures/aave";

const activeRow = {
  id: "policy-base-sepolia",
  targetHealthFactor: { toString: () => "1.6" },
  warningHealthFactor: { toString: () => "1.55" },
  emergencyHealthFactor: { toString: () => "1.30" },
  maxAutonomousAmountUsd: { toString: () => "500" },
  maxDailyAutonomousAmountUsd: { toString: () => "1000" },
  approvalRequiredAboveUsd: { toString: () => "400" },
  allowRepay: true,
  allowAddCollateral: true,
  interventionCooldownMinutes: 30,
  enabled: true,
  updatedAt: new Date("2026-09-10T00:00:00.000Z"),
};

const store = (row: typeof activeRow | null): ActivePolicyStore => ({
  protectionPolicy: { findFirst: vi.fn().mockResolvedValue(row) },
});

describe("active protection policy loading", () => {
  it("loads and validates the enabled wallet-and-chain policy", async () => {
    const source = store(activeRow);
    const result = await loadActiveProtectionPolicy({ walletAddress: wallet, chainId: baseSepoliaConfig.chainId }, source);
    expect(result).toMatchObject({
      policyId: activeRow.id,
      policyUpdatedAt: activeRow.updatedAt.toISOString(),
      policy: { targetHealthFactor: "1.6", warningHealthFactor: "1.55", emergencyHealthFactor: "1.30", enabled: true },
    });
    expect(source.protectionPolicy.findFirst).toHaveBeenCalledWith({
      where: { chainId: baseSepoliaConfig.chainId, user: { walletAddress: wallet.toLowerCase() } },
    });
  });

  it("fails closed when no policy exists", async () => {
    await expect(loadActiveProtectionPolicy({ walletAddress: wallet, chainId: baseSepoliaConfig.chainId }, store(null)))
      .rejects.toMatchObject({ code: "ACTIVE_POLICY_NOT_FOUND" });
  });

  it("fails closed when the policy is disabled", async () => {
    await expect(loadActiveProtectionPolicy({ walletAddress: wallet, chainId: baseSepoliaConfig.chainId }, store({ ...activeRow, enabled: false })))
      .rejects.toMatchObject({ code: "ACTIVE_POLICY_DISABLED" });
  });

  it("loads policy before RPC and never substitutes preview defaults", async () => {
    const position = await getAavePosition({ walletAddress: wallet, chainId: baseSepoliaConfig.chainId }, readerFor(reserves, baseSepoliaConfig));
    const loadPolicy = vi.fn().mockResolvedValue({ policyId: activeRow.id, policyUpdatedAt: activeRow.updatedAt.toISOString(), policy: { ...previewPolicy, targetHealthFactor: "1.6", warningHealthFactor: "1.55", emergencyHealthFactor: "1.30" } });
    const getPosition = vi.fn().mockResolvedValue(position);
    const result = await prepareLiveProtectionAnalysis({ walletAddress: wallet, chainId: baseSepoliaConfig.chainId }, { loadPolicy, getPosition });
    expect(loadPolicy.mock.invocationCallOrder[0]).toBeLessThan(getPosition.mock.invocationCallOrder[0]!);
    expect(result.policy.targetHealthFactor).toBe("1.6");
    expect(result.analysis.policy.targetHealthFactor).toBe("1.6");
  });

  it("does not read Aave when active policy loading fails", async () => {
    const getPosition = vi.fn();
    await expect(prepareLiveProtectionAnalysis({ walletAddress: wallet, chainId: baseSepoliaConfig.chainId }, {
      loadPolicy: vi.fn().mockRejectedValue(new Error("ACTIVE_POLICY_NOT_FOUND")),
      getPosition,
    })).rejects.toThrow("ACTIVE_POLICY_NOT_FOUND");
    expect(getPosition).not.toHaveBeenCalled();
  });
});
