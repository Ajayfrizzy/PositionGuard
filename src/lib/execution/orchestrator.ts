import "server-only";
import { isAddressEqual } from "viem";
import { getAavePosition } from "../aave/service";
import { getAaveAllowance } from "../aave/allowance";
import { getProtectionFunding } from "../aave/funding";
import {
  createKeeperHubDirectClient,
  requireSuccessfulKeeperHubReceipt,
  type KeeperHubDirectClient,
} from "../keeperhub/direct-client";
import { verifyKeeperHub } from "../keeperhub/verification";
import { authorizeBroadcast, requireBroadcastAuthorization } from "./authorize";
import { prepareCanonicalProtection } from "./prepare";
import { revalidateCanonicalPreparation } from "./revalidate";
import {
  claimExecution,
  persistConfirmedExecution,
  persistStaleDecision,
  recordBroadcast,
  recordFailed,
  recordUnconfirmed,
  reserveCanonicalExecution,
} from "./persist";
import { verifyAaveTransaction } from "./verification";
import {
  ProtectionExecutionError,
  type CanonicalPreparation,
  type ExecutionMode,
  type ExecutionStage,
  type ProtectionExecutionResult,
  type SafetyChecks,
} from "./types";

export interface OrchestratorDependencies {
  prepare(input?: {
    walletAddress?: string;
    chainId?: number;
    candidateId?: string;
  }): Promise<CanonicalPreparation>;
  verifySender(chainId: number): Promise<{
    reportedWallet: string;
    capabilities: { simulation: boolean | null; broadcast: boolean | null };
  }>;
  funding(input: {
    chainId: number;
    assetSymbol: "USDC" | "WETH";
    sender: `0x${string}`;
    amount: string;
  }): Promise<{ balanceUnits: string; requiredUnits: string; sufficient: boolean }>;
  allowance(input: {
    chainId: number;
    assetSymbol: "USDC" | "WETH";
    sender: `0x${string}`;
    amount: string;
  }): Promise<{ currentAllowance: string; requiredAmount: string; sufficient: boolean }>;
  keeperHub: KeeperHubDirectClient;
  revalidate(
    prepared: CanonicalPreparation,
  ): Promise<{ unchanged: boolean; refreshed: CanonicalPreparation | null }>;
  authorize(input: {
    presentedSecret?: string | null;
    effectFingerprint: string;
  }): ReturnType<typeof authorizeBroadcast>;
  persistStale(
    prepared: CanonicalPreparation,
    refreshed: CanonicalPreparation | null,
  ): Promise<void>;
  reserve: typeof reserveCanonicalExecution;
  claim: typeof claimExecution;
  recordBroadcast: typeof recordBroadcast;
  recordFailed: typeof recordFailed;
  recordUnconfirmed: typeof recordUnconfirmed;
  verifyChain: typeof verifyAaveTransaction;
  readPost(input: {
    walletAddress: string;
    chainId: number;
  }): Promise<CanonicalPreparation["position"]>;
  persistConfirmed: typeof persistConfirmedExecution;
}
const direct = createKeeperHubDirectClient();
const defaults: OrchestratorDependencies = {
  prepare: prepareCanonicalProtection,
  verifySender: async (chainId) => verifyKeeperHub(undefined, undefined, chainId),
  funding: getProtectionFunding,
  allowance: getAaveAllowance,
  keeperHub: direct,
  revalidate: revalidateCanonicalPreparation,
  authorize: authorizeBroadcast,
  persistStale: persistStaleDecision,
  reserve: reserveCanonicalExecution,
  claim: claimExecution,
  recordBroadcast,
  recordFailed,
  recordUnconfirmed,
  verifyChain: verifyAaveTransaction,
  readPost: getAavePosition,
  persistConfirmed: persistConfirmedExecution,
};
const symbol = (value: string) => {
  if (value === "USDC" || value === "WETH") return value;
  throw new ProtectionExecutionError("UNSUPPORTED_ASSET", "CALCULATING_MEI");
};
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function executeProtectionCore(
  input: {
    mode: ExecutionMode;
    broadcastSecret?: string | null;
    walletAddress?: string;
    chainId?: number;
    candidateId?: string;
  },
  dependencies: OrchestratorDependencies,
  autonomous: boolean,
): Promise<ProtectionExecutionResult> {
  const stages: ExecutionStage[] = [];
  const stage = (value: ExecutionStage) => {
    stages.push(value);
  };
  stage("REFRESHING_POSITION");
  stage("VALIDATING_POLICY");
  stage("CALCULATING_MEI");
  const prepared = await dependencies.prepare({
    walletAddress: input.walletAddress,
    chainId: input.chainId,
    candidateId: input.candidateId,
  });
  if (autonomous && prepared.policy.executionMode !== "AUTONOMOUS")
    throw new ProtectionExecutionError("AUTONOMOUS_MODE_NOT_ENABLED", "VALIDATING_POLICY");
  const assetSymbol = symbol(prepared.candidate.assetSymbol ?? "");
  const amount = prepared.candidate.tokenAmount!;
  stage("VERIFYING_SENDER");
  const sender = await dependencies.verifySender(prepared.chainId);
  if (
    !isAddressEqual(sender.reportedWallet as `0x${string}`, prepared.intent.expectedSender) ||
    !sender.capabilities.simulation ||
    (input.mode === "broadcast" && !sender.capabilities.broadcast)
  )
    throw new ProtectionExecutionError("KEEPERHUB_SENDER_MISMATCH", "VERIFYING_SENDER");
  stage("VERIFYING_BALANCE");
  const funding = await dependencies.funding({
    chainId: prepared.chainId,
    assetSymbol,
    sender: prepared.intent.expectedSender,
    amount,
  });
  if (!funding.sufficient)
    throw new ProtectionExecutionError(
      "INSUFFICIENT_PROTECTION_BALANCE",
      "VERIFYING_BALANCE",
      funding,
    );
  stage("VERIFYING_ALLOWANCE");
  const allowance = await dependencies.allowance({
    chainId: prepared.chainId,
    assetSymbol,
    sender: prepared.intent.expectedSender,
    amount,
  });
  if (!allowance.sufficient)
    throw new ProtectionExecutionError(
      "INSUFFICIENT_AAVE_ALLOWANCE",
      "VERIFYING_ALLOWANCE",
      allowance,
    );
  stage("SIMULATING");
  const simulation = await dependencies.keeperHub.simulate(prepared.intent);
  if (
    !simulation.success ||
    simulation.wouldRevert ||
    !isAddressEqual(simulation.from, prepared.intent.expectedSender) ||
    !isAddressEqual(simulation.to, prepared.intent.body.contractAddress)
  )
    throw new ProtectionExecutionError("KEEPERHUB_SIMULATION_FAILED", "SIMULATING");
  const checks: SafetyChecks = {
    sender: {
      expected: prepared.intent.expectedSender,
      actual: sender.reportedWallet,
      verified: true,
    },
    funding,
    allowance,
    simulation,
  };
  const common = {
    stages,
    currentHealthFactor: prepared.position.account.healthFactor,
    selectedAction: prepared.intent.action,
    amount,
    asset: assetSymbol,
    projectedHealthFactor: prepared.candidate.expectedHealthFactor,
    simulation: {
      success: true as const,
      wouldRevert: false as const,
      gasEstimate: simulation.gasEstimate,
    },
    checks,
  };
  if (input.mode === "simulate") {
    stage("READY_TO_EXECUTE");
    return { ...common, outcome: "READY_TO_EXECUTE", stage: "READY_TO_EXECUTE" };
  }
  stage("REVALIDATING");
  const revalidated = await dependencies.revalidate(prepared);
  if (!revalidated.unchanged) {
    await dependencies.persistStale(prepared, revalidated.refreshed);
    return {
      ...common,
      outcome: "POSITION_CHANGED",
      stage: "REVALIDATING",
      refreshed: {
        healthFactor: revalidated.refreshed?.position.account.healthFactor ?? null,
        action: revalidated.refreshed?.intent.action ?? null,
        amount: revalidated.refreshed?.candidate.tokenAmount ?? null,
      },
    };
  }
  stage("READY_TO_EXECUTE");
  const authorization = autonomous
    ? true
    : requireBroadcastAuthorization(
        dependencies.authorize({
          presentedSecret: input.broadcastSecret,
          effectFingerprint: prepared.effectFingerprint,
        }),
        prepared.effectFingerprint,
      );
  if (!authorization)
    return { ...common, outcome: "AUTHORIZATION_REQUIRED", stage: "READY_TO_EXECUTE" };
  const reservation = await dependencies.reserve(prepared, simulation);
  if (reservation.duplicate && reservation.execution.executionStatus !== "NOT_STARTED")
    return {
      ...common,
      outcome: "DUPLICATE_PREVENTED",
      stage: "READY_TO_EXECUTE",
      idempotencyKey: reservation.idempotencyKey,
      executionId: reservation.execution.keeperHubExecutionId ?? reservation.execution.id,
      transactionHash: reservation.execution.transactionHash ?? undefined,
    };
  if (!(await dependencies.claim(reservation.execution.id)))
    return {
      ...common,
      outcome: "DUPLICATE_PREVENTED",
      stage: "READY_TO_EXECUTE",
      idempotencyKey: reservation.idempotencyKey,
      executionId: reservation.execution.id,
    };
  stage("BROADCASTING");
  let submission;
  try {
    submission = await dependencies.keeperHub.broadcast(
      prepared.intent,
      reservation.idempotencyKey,
    );
    await dependencies.recordBroadcast(reservation.execution.id, {
      keeperHubExecutionId: submission.executionId,
      transactionHash: submission.transactionHash,
      transactionLink: submission.transactionLink,
    });
  } catch (error) {
    await dependencies.recordUnconfirmed(
      reservation.execution.id,
      error instanceof Error ? error.message : "BROADCAST_OUTCOME_UNKNOWN",
    );
    throw error;
  }
  let status;
  const deadline = Date.now() + 45_000;
  do {
    const response = await dependencies.keeperHub.status(submission.executionId);
    status = response.result;
    if (
      response.pollAfterSeconds === 0 ||
      ["completed", "failed", "unconfirmed"].includes(status.status)
    )
      break;
    await wait(Math.max(250, response.pollAfterSeconds * 1000));
  } while (Date.now() < deadline);
  if (
    !status ||
    status.status === "unconfirmed" ||
    !["completed", "failed"].includes(status.status)
  ) {
    await dependencies.recordUnconfirmed(
      reservation.execution.id,
      "KEEPERHUB_UNCONFIRMED",
      status?.transactionHash,
    );
    return {
      ...common,
      outcome: "UNCONFIRMED",
      stage: "BROADCASTING",
      executionId: submission.executionId,
      transactionHash: status?.transactionHash ?? submission.transactionHash,
      idempotencyKey: reservation.idempotencyKey,
    };
  }
  stage("VERIFYING_RECEIPT");
  let receipt;
  try {
    receipt = requireSuccessfulKeeperHubReceipt(status, prepared.chainId);
    const proof = await dependencies.verifyChain({
      chainId: prepared.chainId,
      transactionHash: receipt.hash,
      expectedBlockNumber: receipt.blockNumber,
      intent: prepared.intent,
    });
    stage("VERIFYING_AAVE_POSITION");
    const post = await dependencies.readPost({
      walletAddress: prepared.walletAddress,
      chainId: prepared.chainId,
    });
    if (
      post.account.healthFactor !== null &&
      prepared.position.account.healthFactor !== null &&
      BigInt(post.account.healthFactorWad) <= BigInt(prepared.position.account.healthFactorWad)
    )
      throw new ProtectionExecutionError(
        "HEALTH_FACTOR_DID_NOT_IMPROVE",
        "VERIFYING_AAVE_POSITION",
      );
    await dependencies.persistConfirmed(reservation.execution.id, prepared, post, {
      transactionHash: proof.transactionHash,
      transactionLink: status.transactionLink,
    });
  } catch (error) {
    await dependencies.recordFailed(
      reservation.execution.id,
      error instanceof Error ? error.message : "VERIFICATION_FAILED",
    );
    throw error;
  }
  stage("CONFIRMED");
  return {
    ...common,
    outcome: "CONFIRMED",
    stage: "CONFIRMED",
    executionId: submission.executionId,
    transactionHash: receipt.hash,
    idempotencyKey: reservation.idempotencyKey,
  };
}

export function executeProtection(
  input: {
    mode: ExecutionMode;
    broadcastSecret?: string | null;
    walletAddress?: string;
    chainId?: number;
    candidateId?: string;
  },
  dependencies: OrchestratorDependencies = defaults,
) {
  return executeProtectionCore(input, dependencies, false);
}

/** Server-worker-only entry point. It still passes every check in the proven orchestrator. */
export function executeAutonomousProtection(
  input: { walletAddress: string; chainId: number; candidateId?: string },
  dependencies: OrchestratorDependencies = defaults,
) {
  return executeProtectionCore({ ...input, mode: "broadcast" }, dependencies, true);
}
