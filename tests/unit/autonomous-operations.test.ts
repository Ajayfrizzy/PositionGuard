import { describe, expect, it, vi } from "vitest";
import {
  assessFundingReadiness,
  selectExecutableCandidate,
  type FundingReadinessDependencies,
} from "../../src/lib/funding/readiness";
import { notify, type NotificationStore } from "../../src/lib/notifications/service";
import { analyzeStress } from "../../src/lib/stress/service";
import { validatePolicy } from "../../src/lib/policies/validator";
import { runMonitoringWorker } from "../../src/lib/monitoring/worker";
import {
  runAllMonitoringCycles,
  type ProtectedAccountTarget,
} from "../../src/lib/monitoring/service";
import type { CandidateAction } from "../../src/lib/protection/types";
import { executionDisposition } from "../../src/lib/policies/execution-mode";
import {
  buildStressRequest,
  presetPriceDrops,
  recoveryTransition,
  stressResultState,
  validateCustomPriceDrop,
} from "../../src/lib/stress/presentation";
import {
  createScenarioAuthorization,
  verifyScenarioAuthorization,
} from "../../src/lib/stress/scenario-auth";
import type { ProtectionResult } from "../../src/lib/protection/types";
import { readFileSync } from "node:fs";

const sender = "0xa7462E9F08C56053c87F3E2a35Af8DBeA4786531";
const candidate = (id: string, rank: number): CandidateAction => ({
  id,
  rank,
  type: "REPAY_DEBT",
  asset: "USDC",
  assetSymbol: "USDC",
  amount: "100",
  tokenAmount: "100",
  estimatedUsdValue: "100",
  expectedHealthFactor: "1.5",
  reachesTarget: true,
  policyValidity: true,
  valid: true,
  requiresApproval: false,
  rejectionReason: null,
});
const readinessDeps = (
  patch: Partial<FundingReadinessDependencies> = {},
): FundingReadinessDependencies => ({
  verifySender: vi.fn(async () => ({
    reportedWallet: sender,
    capabilities: { simulation: true, broadcast: true },
  })),
  balance: vi.fn(async () => ({ balanceUnits: "200", requiredUnits: "100", sufficient: true })),
  allowance: vi.fn(async () => ({
    currentAllowance: "200",
    requiredAmount: "100",
    sufficient: true,
  })),
  ...patch,
});

describe("autonomous funding and fallback", () => {
  it("enforces all three execution-mode semantics", () => {
    expect(executionDisposition({ mode: "MONITOR_ONLY", actionable: true, ready: true })).toBe(
      "OBSERVE",
    );
    expect(executionDisposition({ mode: "REQUIRE_APPROVAL", actionable: true, ready: true })).toBe(
      "SIMULATE",
    );
    expect(executionDisposition({ mode: "AUTONOMOUS", actionable: true, ready: true })).toBe(
      "EXECUTE",
    );
    expect(executionDisposition({ mode: "AUTONOMOUS", actionable: true, ready: false })).toBe(
      "BLOCK",
    );
  });
  it("reports READY with explicit amounts", async () =>
    expect(
      await assessFundingReadiness(
        { chainId: 84532, candidate: candidate("a", 1), expectedSender: sender },
        readinessDeps(),
      ),
    ).toMatchObject({
      state: "READY",
      requiredAsset: "USDC",
      requiredAmount: "100",
      availableBalance: "200",
      currentAllowance: "200",
    }));
  it("distinguishes balance and allowance blockers", async () => {
    expect(
      (
        await assessFundingReadiness(
          { chainId: 84532, candidate: candidate("a", 1), expectedSender: sender },
          readinessDeps({
            balance: vi.fn(async () => ({
              balanceUnits: "1",
              requiredUnits: "100",
              sufficient: false,
            })),
          }),
        )
      ).state,
    ).toBe("INSUFFICIENT_BALANCE");
    expect(
      (
        await assessFundingReadiness(
          { chainId: 84532, candidate: candidate("a", 1), expectedSender: sender },
          readinessDeps({
            allowance: vi.fn(async () => ({
              currentAllowance: "1",
              requiredAmount: "100",
              sufficient: false,
            })),
          }),
        )
      ).state,
    ).toBe("INSUFFICIENT_ALLOWANCE");
  });
  it("does not assess funding when there is no actionable candidate", async () => {
    const assess = vi.fn();
    const selected = await selectExecutableCandidate(
      { chainId: 84532, candidates: [], allowApproval: true },
      assess,
    );
    expect(selected).toEqual({ candidate: null, readiness: null, rejected: [] });
    expect(assess).not.toHaveBeenCalled();
  });
  it("reports an actual KeeperHub verification failure as unavailable", async () => {
    const result = await assessFundingReadiness(
      { chainId: 84532, candidate: candidate("a", 1), expectedSender: sender },
      readinessDeps({
        verifySender: vi.fn(async () => {
          throw new Error("offline");
        }),
      }),
    );
    expect(result.state).toBe("KEEPERHUB_UNAVAILABLE");
  });
  it.each(["senderRouteVerified", "phase3Ready"] as const)(
    "evaluates funding when read-only %s is false",
    async (flag) => {
      const dependencies = readinessDeps({
        verifySender: vi.fn(async () => ({
          reportedWallet: sender,
          capabilities: { simulation: true, broadcast: true },
          [flag]: false,
        })),
      });
      expect(
        await assessFundingReadiness(
          { chainId: 84532, candidate: candidate("a", 1), expectedSender: sender },
          dependencies,
        ),
      ).toMatchObject({ state: "READY" });
      expect(dependencies.balance).toHaveBeenCalledOnce();
      expect(dependencies.allowance).toHaveBeenCalledOnce();
    },
  );
  it("falls back deterministically without using a forbidden candidate", async () => {
    const blocked = candidate("minimum", 1),
      ready = candidate("fallback", 2),
      forbidden = { ...candidate("forbidden", 0), valid: false };
    const assess = vi.fn(async ({ candidate: item }: { candidate: CandidateAction }) => ({
      state: item.id === "minimum" ? ("INSUFFICIENT_BALANCE" as const) : ("READY" as const),
      requiredAsset: "USDC",
      requiredAmount: "100",
      availableBalance: "200",
      currentAllowance: "200",
      requiredAllowance: "100",
      sender,
      reason: item.id === "minimum" ? "INSUFFICIENT_FUNDING" : null,
    }));
    const selected = await selectExecutableCandidate(
      { chainId: 84532, candidates: [ready, forbidden, blocked] },
      assess as never,
    );
    expect(selected.candidate?.id).toBe("fallback");
    expect(selected.rejected.map((item) => item.candidateId)).toEqual(["minimum"]);
    expect(assess).toHaveBeenCalledTimes(2);
  });
});

describe("notifications, scenarios, and workers", () => {
  it("deduplicates persisted notifications before delivery", async () => {
    let existing: { id: string } | null = null;
    const deliver = vi.fn(async () => {});
    const store = {
      notification: {
        findUnique: vi.fn(async () => existing),
        create: vi.fn(async () => (existing = { id: "n1" })),
        update: vi.fn(async () => ({})),
      },
    } as unknown as NotificationStore;
    const event = {
      userId: "u1",
      type: "RISK_HIGH" as const,
      title: "High",
      message: "Risk",
      dedupeKey: "u1:high",
    };
    expect((await notify(event, { store, provider: { deliver } })).duplicate).toBe(false);
    expect((await notify(event, { store, provider: { deliver } })).duplicate).toBe(true);
    expect(deliver).toHaveBeenCalledOnce();
  });
  it("applies a deterministic shock, selects an MEI, and has no broadcast capability", () => {
    const position = {
      model: "portfolio-v2" as const,
      healthFactorWad: "1600000000000000000",
      baseCurrencyUnit: "100000000",
      totalDebtBase: "200000000000",
      weightedCollateralNumerator: "3200000000000000",
      debtRounding: "down" as const,
      analysisBlockers: [],
      assets: [
        {
          id: "weth",
          symbol: "WETH",
          decimals: 18,
          priceBase: "200000000000",
          walletBalance: "1000000000000000000",
          suppliedBalance: "2000000000000000000",
          debtBalance: "0",
          liquidationThresholdBps: 8000,
          canRepay: true,
          canSupply: true,
          supplyCapacity: null,
        },
        {
          id: "usdc",
          symbol: "USDC",
          decimals: 6,
          priceBase: "100000000",
          walletBalance: "1000000000",
          suppliedBalance: "0",
          debtBalance: "2000000000",
          liquidationThresholdBps: 0,
          canRepay: true,
          canSupply: false,
          supplyCapacity: null,
        },
      ],
    };
    const policy = validatePolicy({
      executionMode: "REQUIRE_APPROVAL",
      targetHealthFactor: "1.5",
      warningHealthFactor: "1.4",
      emergencyHealthFactor: "1.1",
      maxAutonomousAmountUsd: "1000",
      maxDailyAutonomousAmountUsd: "2000",
      approvalRequiredAboveUsd: "900",
      allowRepay: true,
      allowAddCollateral: true,
      interventionCooldownMinutes: 0,
      enabled: true,
    });
    const result = analyzeStress({
      position,
      policy,
      asset: "WETH",
      percentageShock: -20,
      context: { dailyAutonomousSpendUsd: "0", nowMs: 1, lastAutonomousExecutionAtMs: null },
    });
    expect(result).toMatchObject({
      simulationOnly: true,
      onchainStateChanged: false,
      projectedRisk: "HIGH",
    });
    expect(Number(result.projectedHealthFactor)).toBeCloseTo(1.28);
    expect(result.mei).not.toBeNull();
    expect("broadcast" in result).toBe(false);
  });
  it("runs as a bounded worker loop and clamps over-fast polling", async () => {
    const cycle = vi.fn(async () => []);
    const wait = vi.fn(async () => {});
    const result = await runMonitoringWorker({ cycle, wait, intervalMs: 1, once: true });
    expect(result).toEqual({ cycles: 1, intervalMs: 30_000 });
    expect(wait).not.toHaveBeenCalled();
  });
  it("isolates multiple accounts and continues after one account fails", async () => {
    const targets: ProtectedAccountTarget[] = [
      {
        protectedAccountId: "u1",
        walletAddress: "0x1",
        chainId: 84532,
        policyId: "p1",
        executionMode: "MONITOR_ONLY",
      },
      {
        protectedAccountId: "u2",
        walletAddress: "0x2",
        chainId: 84532,
        policyId: "p2",
        executionMode: "REQUIRE_APPROVAL",
      },
    ];
    const run = vi.fn(async (target: ProtectedAccountTarget) => {
      if (target.protectedAccountId === "u1") throw new Error("failed");
      return { protectedAccountId: target.protectedAccountId };
    });
    const results = await runAllMonitoringCycles({
      load: vi.fn(async () => targets),
      run: run as never,
    });
    expect(results.map((item) => item.ok)).toEqual([false, true]);
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe("first-time scenario workflow", () => {
  const result = (patch: Partial<ProtectionResult>): ProtectionResult => ({
    action: "NO_ACTION",
    status: "NO_ACTION",
    riskLevel: "SAFE",
    selectedCandidate: null,
    candidates: [],
    reasoning: "safe",
    ...patch,
  });
  it("offers the four preset price drops", () => expect(presetPriceDrops).toEqual([5, 10, 15, 20]));
  it("turns custom price drops into negative shocks without accepting an amount", () => {
    const request = buildStressRequest({
      asset: "WETH",
      priceDrop: 12.5,
      scenarioAuthorization: "grant",
    });
    expect(request).toEqual({
      asset: "WETH",
      percentageShock: -12.5,
      scenarioAuthorization: "grant",
    });
    expect("amount" in request).toBe(false);
  });
  it("rejects zero, positive-market, and out-of-range custom drop inputs", () => {
    expect(validateCustomPriceDrop(0)).toMatch(/greater than 0/);
    expect(validateCustomPriceDrop(-5)).toMatch(/greater than 0/);
    expect(validateCustomPriceDrop(100)).toMatch(/less than 100/);
    expect(validateCustomPriceDrop(22.5)).toBeNull();
  });
  it("classifies safe, actionable, and blocked results with friendly blocker copy", () => {
    expect(stressResultState(result({})).kind).toBe("safe");
    const action = candidate("mei", 1);
    expect(
      stressResultState(
        result({
          action: "REPAY_DEBT",
          status: "READY",
          riskLevel: "HIGH",
          selectedCandidate: action,
          candidates: [action],
        }),
      ).kind,
    ).toBe("actionable");
    const rejected = { ...action, valid: false, rejectionReason: "AUTONOMOUS_LIMIT" as const };
    expect(
      stressResultState(
        result({ status: "NO_SAFE_ACTION", riskLevel: "HIGH", candidates: [rejected] }),
      ),
    ).toEqual({ kind: "blocked", blocker: "The action exceeds your policy limit." });
  });
  it("uses a short-lived account-scoped authorization instead of a typed operator secret", () => {
    vi.stubEnv("POSITIONGUARD_DEV_TOKEN", "scenario-test-secret-that-is-at-least-32-characters");
    const token = createScenarioAuthorization({
      protectedAccountId: "account-1",
      chainId: 84532,
      nowMs: 1_000,
    });
    expect(verifyScenarioAuthorization(token, 2_000)).toMatchObject({
      protectedAccountId: "account-1",
      chainId: 84532,
      purpose: "stress-analysis",
    });
    expect(verifyScenarioAuthorization(token, 1_000 + 16 * 60_000)).toBeNull();
    vi.unstubAllEnvs();
  });
  it("keeps simulation labeling visible and the API free of broadcast imports", () => {
    const component = readFileSync(
      new URL("../../src/components/stress-form.tsx", import.meta.url),
      "utf8",
    );
    const route = readFileSync(
      new URL("../../src/app/api/stress/route.ts", import.meta.url),
      "utf8",
    );
    expect(component).toContain("SIMULATION ONLY");
    expect(component).toContain("No funds moved and no blockchain transaction was submitted.");
    expect(component).not.toContain("Operator authorization");
    expect(route).not.toMatch(/executeProtection|broadcast|selectedAmount/);
    expect(route).toContain("verifyScenarioAuthorization");
  });
  it("presents stressed HF as before protection and recovered HF as after protection", () => {
    const transition = recoveryTransition("1.51", "1.60");
    expect(transition).toEqual({
      before: { label: "Before protection", healthFactor: "1.51" },
      after: { label: "After protection", healthFactor: "1.60" },
    });
    const component = readFileSync(
      new URL("../../src/components/stress-form.tsx", import.meta.url),
      "utf8",
    );
    expect(component.indexOf("recovery.before")).toBeLessThan(
      component.indexOf('aria-label="recovers to"'),
    );
    expect(component.indexOf('aria-label="recovers to"')).toBeLessThan(
      component.indexOf("recovery.after"),
    );
    expect(component).toContain("→");
    expect(component).not.toContain("&gt;");
    expect(component).not.toContain('<Icon name="arrow"/>');
  });
  it("uses directional transitions for the other projected-HF summary audited on the dashboard", () => {
    const dashboard = readFileSync(
      new URL("../../src/app/dashboard/page.tsx", import.meta.url),
      "utf8",
    );
    expect(dashboard).toMatch(
      /className="transition-arrow"\s+aria-label="improves to"[\s\S]*?→[\s\S]*?<\/span>/,
    );
  });
});
