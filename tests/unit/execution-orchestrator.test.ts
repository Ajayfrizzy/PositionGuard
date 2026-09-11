import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAaveRepayIntent, aaveIntentFingerprint } from "../../src/lib/aave/intents";
import { baseSepoliaConfig } from "../../src/lib/chains/config";
import {
  executeAutonomousProtection,
  executeProtection,
  type OrchestratorDependencies,
} from "../../src/lib/execution/orchestrator";
import { stableExecutionKey } from "../../src/lib/execution/persist";
import { requireSuccessfulKeeperHubReceipt } from "../../src/lib/keeperhub/direct-client";
import { runMonitoringCycle } from "../../src/lib/monitoring/service";
import type { CanonicalPreparation } from "../../src/lib/execution/types";
import type { AavePosition } from "../../src/lib/aave/types";
import { readFileSync } from "node:fs";

const beneficiary = "0x1cb9Fa3A90b826203408B9eA65be56Ac7e87ef46";
const sender = "0xa7462E9F08C56053c87F3E2a35Af8DBeA4786531";
const intent = buildAaveRepayIntent({
  chainId: 84532,
  assetSymbol: "USDC",
  amount: "0.212852",
  beneficiary,
  sender,
});
const candidate = {
  id: "repay-usdc",
  type: "REPAY_DEBT" as const,
  asset: intent.asset,
  assetSymbol: "USDC",
  amount: "0.212852",
  tokenAmount: "0.212852",
  tokenAmountUnits: "212852",
  estimatedUsdValue: "0.212831",
  expectedHealthFactor: "1.600000000000000001",
  reachesTarget: true,
  policyValidity: true,
  valid: true,
  requiresApproval: false,
  rejectionReason: null,
  rank: 1,
};
const position = (hf = "1.549918707188866008") =>
  ({
    wallet: beneficiary,
    chain: {
      chainId: 84532,
      name: "Base Sepolia",
      testnet: true,
      blockExplorerBaseUrl: "https://sepolia.basescan.org",
    },
    account: {
      healthFactor: hf,
      healthFactorWad: hf.replace(".", "").padEnd(19, "0"),
      totalCollateralUsd: "12.39",
      totalDebtUsd: "6.8",
      availableBorrowsUsd: "0",
      currentLiquidationThreshold: "85",
      ltv: "80",
      eModeCategory: "0",
      raw: {},
    },
    reserves: [],
    walletProtectionBalances: [],
    normalizedProtectionInput: {
      model: "portfolio-v2",
      healthFactorWad: hf.replace(".", "").padEnd(19, "0"),
      baseCurrencyUnit: "100000000",
      totalDebtBase: "680000000",
      weightedCollateralNumerator: "10540000000000",
      debtRounding: "up",
      assets: [],
      analysisBlockers: [],
    },
    analysisBlockers: [],
    blockNumber: "46623815",
    blockHash: `0x${"ab".repeat(32)}`,
    blockTimestamp: "1789015921",
    fetchedAt: "2026-09-10T01:00:00.000Z",
    baseCurrencyUnit: "100000000",
  }) as unknown as AavePosition;
const policy = {
  executionMode: "AUTONOMOUS" as const,
  targetHealthFactor: "1.6",
  warningHealthFactor: "1.55",
  emergencyHealthFactor: "1.3",
  maxAutonomousAmountUsd: "500",
  maxDailyAutonomousAmountUsd: "1000",
  approvalRequiredAboveUsd: "400",
  allowRepay: true,
  allowAddCollateral: true,
  interventionCooldownMinutes: 30,
  enabled: true,
};
const prepared: CanonicalPreparation = {
  walletAddress: beneficiary,
  chainId: 84532,
  policyId: "policy-1",
  policyUpdatedAt: "2026-09-10T00:48:49.721Z",
  policy,
  context: {
    dailyAutonomousSpendUsd: "0",
    nowMs: 1789015921586,
    lastAutonomousExecutionAtMs: null,
  },
  position: position(),
  result: {
    action: "REPAY_DEBT",
    status: "READY",
    riskLevel: "HIGH",
    selectedCandidate: candidate,
    candidates: [candidate],
    reasoning: "MEI",
  },
  candidate,
  intent,
  effectFingerprint: aaveIntentFingerprint(intent),
};
const receiptStatus = {
  executionId: "kh-1",
  status: "completed",
  transactionHash: `0x${"cd".repeat(32)}`,
  transactionLink: `https://sepolia.basescan.org/tx/0x${"cd".repeat(32)}`,
  receipts: [
    {
      hash: `0x${"cd".repeat(32)}`,
      chainId: 84532,
      verified: true,
      receiptStatus: "success" as const,
      blockNumber: 46623820,
      gasUsed: "220000",
    },
  ],
};
function dependencies(patch: Partial<OrchestratorDependencies> = {}) {
  const base = {
    prepare: vi.fn(async () => prepared),
    verifySender: vi.fn(async () => ({
      reportedWallet: sender,
      capabilities: { simulation: true, broadcast: true },
    })),
    funding: vi.fn(async () => ({
      balanceUnits: "1000000",
      requiredUnits: "212852",
      sufficient: true,
    })),
    allowance: vi.fn(async () => ({
      currentAllowance: "275387",
      requiredAmount: "212852",
      sufficient: true,
    })),
    keeperHub: {
      simulate: vi.fn(async () => ({
        success: true as const,
        status: "simulated" as const,
        from: sender,
        to: baseSepoliaConfig.aavePoolAddress,
        value: "0",
        gasEstimate: "220000",
        simulatedReturnValue: "212852",
        wouldRevert: false as const,
      })),
      broadcast: vi.fn(async () => ({
        executionId: "kh-1",
        status: "completed",
        transactionHash: receiptStatus.transactionHash,
        transactionLink: receiptStatus.transactionLink,
      })),
      status: vi.fn(async () => ({ result: receiptStatus, pollAfterSeconds: 0 })),
    },
    revalidate: vi.fn(async () => ({ unchanged: true, refreshed: prepared })),
    authorize: vi.fn(() => ({
      approved: true as const,
      effectFingerprint: prepared.effectFingerprint,
      authorizedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    })),
    persistStale: vi.fn(async () => {}),
    reserve: vi.fn(async () => ({
      execution: {
        id: "db-1",
        executionStatus: "NOT_STARTED",
        keeperHubExecutionId: null,
        transactionHash: null,
      },
      idempotencyKey: stableExecutionKey(prepared),
      duplicate: false,
    })),
    claim: vi.fn(async () => true),
    recordBroadcast: vi.fn(async () => {}),
    recordFailed: vi.fn(async () => {}),
    recordUnconfirmed: vi.fn(async () => {}),
    verifyChain: vi.fn(async () => ({
      transactionHash: receiptStatus.transactionHash,
      blockNumber: "46623820",
      eventName: "Repay" as const,
      amount: "212852",
    })),
    readPost: vi.fn(async () => position("1.599999884615885683")),
    persistConfirmed: vi.fn(async () => {}),
  };
  return { ...base, ...patch } as unknown as OrchestratorDependencies;
}
afterEach(() => vi.unstubAllEnvs());

describe("controlled execution orchestration", () => {
  it("uses server preparation with the active policy and recomputed MEI", async () => {
    const deps = dependencies();
    const result = await executeProtection({ mode: "simulate" }, deps);
    expect(deps.prepare).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      outcome: "READY_TO_EXECUTE",
      amount: "0.212852",
      asset: "USDC",
    });
  });
  it("simulation reaches READY_TO_EXECUTE and never broadcasts", async () => {
    const deps = dependencies();
    const result = await executeProtection({ mode: "simulate" }, deps);
    expect(deps.keeperHub.simulate).toHaveBeenCalledOnce();
    expect(deps.keeperHub.broadcast).not.toHaveBeenCalled();
    expect(result.stages.at(-1)).toBe("READY_TO_EXECUTE");
  });
  it("missing authorization blocks broadcast", async () => {
    const deps = dependencies({ authorize: vi.fn(() => null) });
    const result = await executeProtection({ mode: "broadcast" }, deps);
    expect(result.outcome).toBe("AUTHORIZATION_REQUIRED");
    expect(deps.keeperHub.broadcast).not.toHaveBeenCalled();
  });
  it("stale state records cancellation and never broadcasts", async () => {
    const deps = dependencies({
      revalidate: vi.fn(async () => ({ unchanged: false, refreshed: null })),
    });
    const result = await executeProtection({ mode: "broadcast" }, deps);
    expect(result.outcome).toBe("POSITION_CHANGED");
    expect(deps.persistStale).toHaveBeenCalledOnce();
    expect(deps.keeperHub.broadcast).not.toHaveBeenCalled();
  });
  it("sender mismatch blocks before funding or simulation", async () => {
    const deps = dependencies({
      verifySender: vi.fn(async () => ({
        reportedWallet: beneficiary,
        capabilities: { simulation: true, broadcast: true },
      })),
    });
    await expect(executeProtection({ mode: "simulate" }, deps)).rejects.toMatchObject({
      code: "KEEPERHUB_SENDER_MISMATCH",
    });
    expect(deps.funding).not.toHaveBeenCalled();
  });
  it("insufficient balance blocks simulation", async () => {
    const deps = dependencies({
      funding: vi.fn(async () => ({
        balanceUnits: "1",
        requiredUnits: "212852",
        sufficient: false,
      })),
    });
    await expect(executeProtection({ mode: "simulate" }, deps)).rejects.toMatchObject({
      code: "INSUFFICIENT_PROTECTION_BALANCE",
    });
    expect(deps.keeperHub.simulate).not.toHaveBeenCalled();
  });
  it("insufficient allowance blocks simulation", async () => {
    const deps = dependencies({
      allowance: vi.fn(async () => ({
        currentAllowance: "1",
        requiredAmount: "212852",
        sufficient: false,
      })),
    });
    await expect(executeProtection({ mode: "simulate" }, deps)).rejects.toMatchObject({
      code: "INSUFFICIENT_AAVE_ALLOWANCE",
    });
    expect(deps.keeperHub.simulate).not.toHaveBeenCalled();
  });
  it("failed simulation blocks execution", async () => {
    const deps = dependencies();
    deps.keeperHub.simulate = vi.fn(async () => ({
      success: true,
      status: "simulated",
      from: sender,
      to: baseSepoliaConfig.aavePoolAddress,
      value: "0",
      gasEstimate: "1",
      wouldRevert: true,
    })) as never;
    await expect(executeProtection({ mode: "simulate" }, deps)).rejects.toMatchObject({
      code: "KEEPERHUB_SIMULATION_FAILED",
    });
    expect(deps.keeperHub.broadcast).not.toHaveBeenCalled();
  });
  it("reuses a stable effect-derived idempotency key", () => {
    expect(stableExecutionKey(prepared)).toBe(stableExecutionKey({ ...prepared }));
    expect(stableExecutionKey({ ...prepared, policyId: "other" })).not.toBe(
      stableExecutionKey(prepared),
    );
  });
  it("prevents duplicate execution without another broadcast", async () => {
    const deps = dependencies({
      reserve: vi.fn(async () => ({
        execution: {
          id: "db-1",
          executionStatus: "SUBMITTED",
          keeperHubExecutionId: "kh-existing",
          transactionHash: receiptStatus.transactionHash,
        },
        idempotencyKey: stableExecutionKey(prepared),
        duplicate: true,
      })) as never,
    });
    const result = await executeProtection({ mode: "broadcast" }, deps);
    expect(result.outcome).toBe("DUPLICATE_PREVENTED");
    expect(deps.keeperHub.broadcast).not.toHaveBeenCalled();
  });
  it("verifies KeeperHub receipt, RPC/Aave event and persists post-state", async () => {
    const deps = dependencies();
    const result = await executeProtection(
      { mode: "broadcast", broadcastSecret: "server-only" },
      deps,
    );
    expect(result.outcome).toBe("CONFIRMED");
    expect(deps.verifyChain).toHaveBeenCalledWith(
      expect.objectContaining({ intent, expectedBlockNumber: 46623820 }),
    );
    expect(deps.persistConfirmed).toHaveBeenCalledWith(
      "db-1",
      prepared,
      expect.objectContaining({
        account: expect.objectContaining({ healthFactor: "1.599999884615885683" }),
      }),
      expect.anything(),
    );
  });
  it("authorizes autonomous broadcast only from an AUTONOMOUS policy", async () => {
    const deps = dependencies();
    const result = await executeAutonomousProtection(
      { walletAddress: beneficiary, chainId: 84532 },
      deps,
    );
    expect(result.outcome).toBe("CONFIRMED");
    expect(deps.keeperHub.broadcast).toHaveBeenCalledOnce();
  });
  it("blocks autonomous broadcast for approval-gated policies", async () => {
    const gated = {
      ...prepared,
      policy: { ...policy, executionMode: "REQUIRE_APPROVAL" as const },
    };
    const deps = dependencies({ prepare: vi.fn(async () => gated) });
    await expect(
      executeAutonomousProtection({ walletAddress: beneficiary, chainId: 84532 }, deps),
    ).rejects.toMatchObject({ code: "AUTONOMOUS_MODE_NOT_ENABLED" });
    expect(deps.keeperHub.broadcast).not.toHaveBeenCalled();
  });
});

describe("receipt, precision and monitoring contracts", () => {
  it("accepts only nonempty verified successful receipt evidence", () =>
    expect(requireSuccessfulKeeperHubReceipt(receiptStatus, 84532).receiptStatus).toBe("success"));
  it("rejects a completed execution with no verified receipts", () =>
    expect(() =>
      requireSuccessfulKeeperHubReceipt({ ...receiptStatus, receipts: [] }, 84532),
    ).toThrow("KEEPERHUB_RECEIPT_MISSING"));
  it("keeps all health factor persistence columns at 18 decimals", () => {
    const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
    expect(
      schema.match(/healthFactor(Before|After)|expectedHealthFactor/g)?.length,
    ).toBeGreaterThanOrEqual(4);
    expect(schema.match(/@db\.Decimal\(78, 18\)/g)?.length).toBeGreaterThanOrEqual(6);
  });
  it("monitoring persists a decision result without any broadcaster dependency", async () => {
    vi.stubEnv("AAVE_WALLET_ADDRESS", beneficiary);
    const prepare = vi.fn(async () => ({
      position: prepared.position,
      policyId: prepared.policyId,
      policyUpdatedAt: prepared.policyUpdatedAt,
      policy,
      analysis: {
        policy,
        mode: "READ_ONLY_PREVIEW" as const,
        fundingWallet: beneficiary as `0x${string}`,
        contextAssumption: "test",
        result: prepared.result,
      },
    }));
    const persist = vi.fn(async () => ({
      snapshotId: "s1",
      decisionId: "d1",
      riskLevel: "HIGH",
      status: "READY",
    }));
    const result = await runMonitoringCycle({ prepare, persist });
    expect(result).toMatchObject({ decisionId: "d1", riskLevel: "HIGH" });
    expect(persist).toHaveBeenCalledOnce();
  });
});
