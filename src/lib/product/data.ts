import "server-only";
import { unstable_cache } from "next/cache";
import { formatUnits, parseUnits } from "viem";
import { getChain, getDefaultChain } from "../chains/config";
import { getProtectionAsset } from "../chains/assets";
import { getPrisma } from "../db/prisma";
import type { CandidateAction, RiskLevel } from "../protection/types";
import {
  mapCandidates,
  protectionDecisionState,
  shouldShowProtectionAttention,
  type ProductData,
  type ProductPolicy,
  type ProductPosition,
} from "./models";
import { transactionExplorerUrl } from "./format";
import { mapMonitoringPresentation, mapWorkerHealth } from "./status";
import { readWorkerHeartbeat } from "../monitoring/heartbeat";

const EMPTY_POLICY: ProductPolicy = {
  executionMode: "REQUIRE_APPROVAL",
  id: null,
  targetHealthFactor: "1.60",
  warningHealthFactor: "1.45",
  emergencyHealthFactor: "1.10",
  maxAutonomousAmountUsd: "250",
  maxDailyAutonomousAmountUsd: "500",
  approvalRequiredAboveUsd: "200",
  allowRepay: true,
  allowAddCollateral: true,
  interventionCooldownMinutes: 30,
  enabled: false,
  updatedAt: null,
};
const EMPTY_POSITION: ProductPosition = {
  wallet: null,
  healthFactor: null,
  totalCollateralUsd: "0",
  totalDebtUsd: "0",
  availableBorrowsUsd: "0",
  liquidationThreshold: null,
  blockNumber: null,
  blockTimestamp: null,
  capturedAt: null,
  reserves: [],
};

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonRecord) : {};
const string = (value: unknown, fallback = "0") =>
  typeof value === "string" || typeof value === "number" ? String(value) : fallback;

function positionFromSnapshot(
  snapshot: {
    healthFactor: { toString(): string } | null;
    totalCollateralUsd: { toString(): string };
    totalDebtUsd: { toString(): string };
    availableBorrowsUsd: { toString(): string };
    blockNumber: bigint | null;
    blockTimestamp: bigint | null;
    capturedAt: Date;
    normalizedContext: unknown;
  },
  wallet: string,
): ProductPosition {
  const context = record(snapshot.normalizedContext);
  const rawPosition = record(context.position);
  const account = record(rawPosition.account);
  const portfolio = record(
    rawPosition.normalizedProtectionInput ?? (context.model === "portfolio-v2" ? context : {}),
  );
  const hasFormattedReserves = Array.isArray(rawPosition.reserves);
  const reservesRaw = hasFormattedReserves
    ? (rawPosition.reserves as unknown[])
    : Array.isArray(portfolio.assets)
      ? portfolio.assets
      : [];
  const baseUnit = BigInt(string(portfolio.baseCurrencyUnit, "100000000"));
  return {
    wallet,
    healthFactor: snapshot.healthFactor?.toString() ?? null,
    totalCollateralUsd: snapshot.totalCollateralUsd.toString(),
    totalDebtUsd: snapshot.totalDebtUsd.toString(),
    availableBorrowsUsd: snapshot.availableBorrowsUsd.toString(),
    liquidationThreshold:
      typeof account.currentLiquidationThreshold === "string"
        ? account.currentLiquidationThreshold
        : null,
    blockNumber: snapshot.blockNumber?.toString() ?? null,
    blockTimestamp: snapshot.blockTimestamp?.toString() ?? null,
    capturedAt: snapshot.capturedAt.toISOString(),
    reserves: reservesRaw.map((value) => {
      const reserve = record(value);
      const raw = record(reserve.raw);
      const decimals = Number(reserve.decimals ?? 0);
      const unit = 10n ** BigInt(decimals);
      const price = BigInt(string(reserve.priceBase, "0"));
      const suppliedRaw = string(reserve.suppliedBalance);
      const debtRaw =
        reserve.debtBalance === undefined
          ? String(BigInt(string(raw.variableDebt)) + BigInt(string(raw.stableDebt)))
          : string(reserve.debtBalance);
      const walletRaw = string(reserve.walletBalance);
      const amount = (value: string) => (decimals ? formatUnits(BigInt(value), decimals) : value);
      const usd = (value: string) =>
        unit && baseUnit
          ? (Number(BigInt(value) * price) / Number(unit * baseUnit)).toString()
          : "0";
      const storedUsd = (value: unknown, rawValue: string) =>
        typeof value === "string" || typeof value === "number" ? String(value) : usd(rawValue);
      const normalizedDebt = hasFormattedReserves
        ? reserve.variableDebt !== undefined || reserve.stableDebt !== undefined
          ? formatUnits(
              parseUnits(string(reserve.variableDebt), decimals) +
                parseUnits(string(reserve.stableDebt), decimals),
              decimals,
            )
          : string(reserve.debtBalance)
        : amount(debtRaw);
      return {
        asset: string(reserve.asset ?? reserve.id, "unknown"),
        symbol: string(reserve.symbol, "Asset"),
        suppliedBalance: hasFormattedReserves ? suppliedRaw : amount(suppliedRaw),
        suppliedUsd: storedUsd(reserve.suppliedUsd, suppliedRaw),
        debtBalance: normalizedDebt,
        debtUsd: storedUsd(reserve.debtUsd, debtRaw),
        walletBalance: hasFormattedReserves ? walletRaw : amount(walletRaw),
        walletBalanceUsd: storedUsd(reserve.walletBalanceUsd, walletRaw),
        collateralEnabled:
          reserve.collateralEnabled === true || (!hasFormattedReserves && BigInt(suppliedRaw) > 0n),
        liquidationThreshold:
          reserve.liquidationThreshold === undefined
            ? (Number(reserve.liquidationThresholdBps ?? 0) / 10_000).toString()
            : string(reserve.liquidationThreshold),
      };
    }),
  };
}

function executionDisplayAmount(asset: string, amount: string, chainId: number) {
  try {
    const normalized =
      (["USDC", "WETH"] as const).find(
        (symbol) =>
          symbol === asset.toUpperCase() ||
          getProtectionAsset(chainId, symbol).address.toLowerCase() === asset.toLowerCase(),
      ) ?? null;
    if (!normalized) return amount;
    return formatUnits(BigInt(amount), getProtectionAsset(chainId, normalized).decimals);
  } catch {
    return amount;
  }
}
function executionAssetSymbol(asset: string, chainId: number) {
  try {
    return (
      (["USDC", "WETH"] as const).find(
        (symbol) =>
          symbol === asset.toUpperCase() ||
          getProtectionAsset(chainId, symbol).address.toLowerCase() === asset.toLowerCase(),
      ) ?? asset
    );
  } catch {
    return asset;
  }
}
function liveRisk(healthFactor: string | null, policy: ProductPolicy): RiskLevel {
  if (healthFactor === null) return "SAFE";
  const hf = parseUnits(healthFactor, 18);
  if (hf >= parseUnits(policy.targetHealthFactor, 18)) return "SAFE";
  if (hf >= parseUnits(policy.warningHealthFactor, 18)) return "WATCH";
  if (hf >= parseUnits(policy.emergencyHealthFactor, 18)) return "HIGH";
  return "CRITICAL";
}

async function loadProductDataUncached(
  accountScope?: string | null,
  chainScope?: number,
  view: ProductDataView = "full",
): Promise<ProductData> {
  const network = chainScope ? getChain(chainScope) : getDefaultChain();
  const base = {
    network: {
      chainId: network.chainId,
      name: network.name,
      testnet: network.testnet,
      explorer: network.blockExplorerBaseUrl,
    },
    rpc: process.env[network.rpcEnvKey] ? ("connected" as const) : ("disconnected" as const),
    keeperHub: {
      authenticated: process.env.KEEPERHUB_API_KEY
        ? ("connected" as const)
        : ("disconnected" as const),
      senderVerified: process.env.KEEPERHUB_EXECUTION_WALLET
        ? ("connected" as const)
        : ("unknown" as const),
      sender: process.env.KEEPERHUB_EXECUTION_WALLET ?? null,
    },
  };
  try {
    const db = getPrisma();
    const configuredWallet = process.env.AAVE_WALLET_ADDRESS?.toLowerCase();
    const needsDecision =
      view === "full" || view === "dashboard" || view === "protection" || view === "settings";
    const needsActivity = view === "full" || view === "activity";
    const needsLatestExecution = needsActivity || view === "dashboard" || view === "protection";
    const heartbeatPromise = readWorkerHeartbeat(network.chainId);
    const userPromise = db.user.findFirst({
      where:
        accountScope === null
          ? { id: "__unauthenticated__" }
          : accountScope
            ? { id: accountScope }
            : configuredWallet
              ? { walletAddress: configuredWallet }
              : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { auditEvents: true } },
        policies: { where: { chainId: network.chainId }, orderBy: { updatedAt: "desc" }, take: 1 },
        snapshots: {
          where: { chainId: network.chainId },
          orderBy: { capturedAt: "desc" },
          take: 1,
        },
        decisions: {
          orderBy: { createdAt: "desc" },
          take: needsDecision ? 1 : 0,
          include: { snapshot: true, candidates: { orderBy: { rank: "asc" } } },
        },
        auditEvents: {
          where: view === "protection" ? { type: "POSITION_CHANGED" } : undefined,
          orderBy: { createdAt: "desc" },
          take: needsActivity ? 100 : view === "protection" ? 1 : 0,
        },
        monitoringRuns: {
          where: { chainId: network.chainId },
          orderBy: { startedAt: "desc" },
          take: view === "full" || view === "dashboard" ? 1 : 0,
        },
      },
    });
    const executionTake = needsActivity ? 25 : needsLatestExecution ? 1 : 0;
    const scopedExecutionsPromise =
      accountScope && executionTake
        ? db.execution.findMany({
            where: { decision: { userId: accountScope } },
            include: { decision: { include: { snapshot: true } } },
            orderBy: { createdAt: "desc" },
            take: executionTake,
          })
        : null;
    const [user, heartbeat] = await Promise.all([userPromise, heartbeatPromise]);
    const executions =
      scopedExecutionsPromise !== null
        ? await scopedExecutionsPromise
        : executionTake
          ? await db.execution.findMany({
              where: user
                ? { decision: { userId: user.id } }
                : accountScope === null
                  ? { id: "__unauthenticated__" }
                  : undefined,
              include: { decision: { include: { snapshot: true } } },
              orderBy: { createdAt: "desc" },
              take: executionTake,
            })
          : [];
    const totalExecutionCount = user
      ? await db.execution.count({ where: { decision: { userId: user.id } } })
      : 0;
    const policyRow = user?.policies[0];
    const policy: ProductPolicy = policyRow
      ? {
          id: policyRow.id,
          executionMode: policyRow.executionMode,
          targetHealthFactor: policyRow.targetHealthFactor.toString(),
          warningHealthFactor: policyRow.warningHealthFactor.toString(),
          emergencyHealthFactor: policyRow.emergencyHealthFactor.toString(),
          maxAutonomousAmountUsd: policyRow.maxAutonomousAmountUsd.toString(),
          maxDailyAutonomousAmountUsd: policyRow.maxDailyAutonomousAmountUsd.toString(),
          approvalRequiredAboveUsd: policyRow.approvalRequiredAboveUsd.toString(),
          allowRepay: policyRow.allowRepay,
          allowAddCollateral: policyRow.allowAddCollateral,
          interventionCooldownMinutes: policyRow.interventionCooldownMinutes,
          enabled: policyRow.enabled,
          updatedAt: policyRow.updatedAt.toISOString(),
        }
      : EMPTY_POLICY;
    const position = user?.snapshots[0]
      ? positionFromSnapshot(user.snapshots[0], user.walletAddress)
      : { ...EMPTY_POSITION, wallet: user?.walletAddress ?? configuredWallet ?? null };
    const hasAavePosition =
      Boolean(position.capturedAt) &&
      (Number(position.totalCollateralUsd) > 0 || Number(position.totalDebtUsd) > 0);
    const decision = user?.decisions[0];
    const rawCandidates: CandidateAction[] = (decision?.candidates ?? []).map((candidate) => ({
      id: candidate.id,
      type: candidate.type === "ADD_COLLATERAL" ? "ADD_COLLATERAL" : "REPAY_DEBT",
      asset: candidate.asset,
      assetSymbol: executionAssetSymbol(candidate.asset, network.chainId),
      amount: candidate.amount.toString(),
      tokenAmount: candidate.amount.toString(),
      estimatedUsdValue: candidate.estimatedUsdValue.toString(),
      expectedHealthFactor: candidate.expectedHealthFactor?.toString() ?? null,
      reachesTarget: candidate.reachesTarget,
      policyValidity: candidate.policyValidity,
      valid: candidate.valid,
      requiresApproval: candidate.requiresApproval,
      rejectionReason: candidate.rejectionReason as CandidateAction["rejectionReason"],
      rank: candidate.rank,
    }));
    const selectedRaw =
      rawCandidates.find(
        (candidate) =>
          decision &&
          candidate.type === decision.selectedAction &&
          candidate.amount === decision.selectedAmount?.toString(),
      ) ??
      rawCandidates.find((candidate) => candidate.valid && !candidate.requiresApproval) ??
      null;
    const candidates = mapCandidates(rawCandidates, selectedRaw?.id ?? null);
    const mappedExecutions = executions.map((execution) => ({
      id: execution.id,
      decisionId: execution.decisionId,
      status: execution.executionStatus,
      simulationStatus: execution.simulationStatus,
      action: execution.action,
      asset: executionAssetSymbol(execution.asset, network.chainId),
      amount: execution.amount.toString(),
      displayAmount: executionDisplayAmount(
        execution.asset,
        execution.amount.toString(),
        network.chainId,
      ),
      transactionHash: execution.transactionHash,
      transactionLink:
        execution.transactionLink ??
        (execution.transactionHash
          ? transactionExplorerUrl(network.blockExplorerBaseUrl, execution.transactionHash)
          : null),
      keeperHubExecutionId: execution.keeperHubExecutionId,
      receiptVerified: execution.receiptVerified,
      healthFactorBefore:
        execution.healthFactorBefore?.toString() ??
        execution.decision.snapshot.healthFactor?.toString() ??
        null,
      healthFactorAfter: execution.healthFactorAfter?.toString() ?? null,
      failureReason: execution.failureReason,
      createdAt: execution.createdAt.toISOString(),
      completedAt: execution.completedAt?.toISOString() ?? null,
    }));
    let riskLevel: RiskLevel = decision?.riskLevel ?? "SAFE";
    if (position.capturedAt) riskLevel = liveRisk(position.healthFactor, policy);
    const auditEvents = (user?.auditEvents ?? []).map((event) => ({
      id: event.id,
      type: event.type,
      severity: event.severity,
      message: event.message,
      createdAt: event.createdAt.toISOString(),
      metadata: record(event.metadata),
    }));
    const fundingContext = record(decision?.fundingReadinessContext);
    const fundingAssessment = decision?.fundingReadiness
      ? {
          state: decision.fundingReadiness,
          requiredAsset: string(fundingContext.requiredAsset, "Not selected"),
          requiredAmount: string(fundingContext.requiredAmount, "—"),
          availableBalance:
            fundingContext.availableBalance === null ||
            fundingContext.availableBalance === undefined
              ? null
              : string(fundingContext.availableBalance),
          currentAllowance:
            fundingContext.currentAllowance === null ||
            fundingContext.currentAllowance === undefined
              ? null
              : string(fundingContext.currentAllowance),
          requiredAllowance: string(fundingContext.requiredAllowance, "—"),
          sender:
            fundingContext.sender === null || fundingContext.sender === undefined
              ? null
              : string(fundingContext.sender),
          reason:
            fundingContext.reason === null || fundingContext.reason === undefined
              ? null
              : string(fundingContext.reason),
          checkedAt:
            typeof fundingContext.checkedAt === "string"
              ? fundingContext.checkedAt
              : decision.createdAt.toISOString(),
        }
      : null;
    const selectedCandidate =
      candidates.find((candidate) => candidate.state === "selected") ?? null;
    const decisionIsCurrent = Boolean(
      decision && user?.snapshots[0] && decision.snapshotId === user.snapshots[0].id,
    );
    const decisionView = decision
      ? {
          id: decision.id,
          riskLevel: decision.riskLevel,
          status: decision.status,
          createdAt: decision.createdAt.toISOString(),
          snapshotBlockNumber: decision.snapshot.blockNumber?.toString() ?? null,
          snapshotHealthFactor: decision.snapshot.healthFactor?.toString() ?? null,
          expectedHealthFactor: decision.expectedHealthFactor?.toString() ?? null,
          candidates,
          selectedCandidate,
        }
      : null;
    const decisionState = protectionDecisionState(decisionView, riskLevel, decisionIsCurrent);
    const protectionAttention = shouldShowProtectionAttention({
      policyEnabled: policy.enabled,
      riskLevel,
      decisionIsCurrent,
      decisionStatus: decision?.status ?? null,
      hasActionableCandidate: Boolean(selectedCandidate?.valid),
    });
    const lastCheck = user?.monitoringRuns[0]?.completedAt?.toISOString() ?? null;
    const worker = mapWorkerHealth({
      lastHeartbeatAt: heartbeat?.lastHeartbeatAt ?? null,
    });
    const monitoringPresentation = mapMonitoringPresentation({
      policyEnabled: policy.enabled,
      workerStatus: worker.status,
    });
    return {
      ...base,
      protectedAccountId: user?.id ?? null,
      monitoring: {
        active: monitoringPresentation.active,
        lastCheck,
        status: worker.status,
      },
      fundingReadiness: decision?.fundingReadiness ?? null,
      fundingAssessment,
      database: "connected",
      aave: position.capturedAt ? "connected" : "unknown",
      position,
      hasAavePosition,
      policy,
      riskLevel,
      analysisHealthFactor: decision?.snapshot.healthFactor?.toString() ?? null,
      candidates,
      selectedCandidate,
      decisionIsCurrent,
      ...decisionState,
      protectionAttention,
      latestExecution: mappedExecutions[0] ?? null,
      executions: mappedExecutions,
      auditEvents,
      positionChangedAt:
        auditEvents.find((event) => event.type === "POSITION_CHANGED")?.createdAt ?? null,
      totalActivityEvents: (user?._count.auditEvents ?? auditEvents.length) + totalExecutionCount,
      error: null,
    };
  } catch (error) {
    console.error(
      "PRODUCT_DATA_LOAD_FAILED",
      error instanceof Error ? error.message : "Unknown error",
    );
    return {
      ...base,
      protectedAccountId: null,
      monitoring: { active: false, lastCheck: null, status: null },
      fundingReadiness: null,
      fundingAssessment: null,
      database: "disconnected",
      aave: "unknown",
      position: {
        ...EMPTY_POSITION,
        wallet: accountScope === undefined ? (process.env.AAVE_WALLET_ADDRESS ?? null) : null,
      },
      hasAavePosition: false,
      policy: EMPTY_POLICY,
      riskLevel: "SAFE",
      analysisHealthFactor: null,
      candidates: [],
      selectedCandidate: null,
      decisionIsCurrent: false,
      currentDecision: null,
      historicalDecision: null,
      currentSelectedCandidate: null,
      currentDecisionIsActionable: false,
      protectionAttention: false,
      latestExecution: null,
      executions: [],
      auditEvents: [],
      positionChangedAt: null,
      totalActivityEvents: 0,
      error:
        "Live product data is temporarily unavailable. Check the database connection and migrations.",
    };
  }
}

// Monitoring snapshots change on a minute-scale cadence. Sharing one short-lived,
// account-scoped result across product tabs avoids repeating the same remote joins
// during navigation while keeping the UI close to the latest completed cycle.
const loadSharedProductData = unstable_cache(
  (accountScope: string, chainScope: number) =>
    loadProductDataUncached(accountScope, chainScope, "full"),
  ["positionguard-product-data-v1"],
  { revalidate: 15, tags: ["product-data"] },
);

export function loadProductData(
  accountScope?: string | null,
  chainScope?: number,
  view: ProductDataView = "full",
) {
  return accountScope && chainScope
    ? loadSharedProductData(accountScope, chainScope)
    : loadProductDataUncached(accountScope, chainScope, view);
}

export type ProductDataView =
  "full" | "dashboard" | "position" | "protection" | "scenario" | "activity" | "settings";

export function chainForId(chainId: number) {
  return getChain(chainId);
}
