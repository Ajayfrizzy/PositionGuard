import "server-only";
import { isAddressEqual } from "viem";
import { getProtectionFunding } from "../aave/funding";
import { getAaveAllowance } from "../aave/allowance";
import { verifyKeeperHub } from "../keeperhub/verification";
import { KeeperHubReadError } from "../keeperhub/types";
import type { CandidateAction } from "../protection/types";

export type FundingReadinessState =
  | "READY"
  | "INSUFFICIENT_BALANCE"
  | "INSUFFICIENT_ALLOWANCE"
  | "SENDER_MISMATCH"
  | "KEEPERHUB_UNAVAILABLE"
  | "UNSUPPORTED_ASSET";
export interface FundingReadiness {
  state: FundingReadinessState;
  requiredAsset: string;
  requiredAmount: string;
  availableBalance: string | null;
  currentAllowance: string | null;
  requiredAllowance: string;
  sender: string | null;
  reason: string | null;
}
export interface FundingReadinessDependencies {
  verifySender(chainId: number): Promise<{
    reportedWallet: string;
    capabilities: { simulation: boolean | null; broadcast: boolean | null };
  }>;
  balance(input: {
    chainId: number;
    assetSymbol: "USDC" | "WETH";
    sender: `0x${string}`;
    amount: string;
  }): Promise<{
    balanceUnits: string;
    requiredUnits: string;
    balance?: string;
    requiredAmount?: string;
    sufficient: boolean;
  }>;
  allowance(input: {
    chainId: number;
    assetSymbol: "USDC" | "WETH";
    sender: `0x${string}`;
    amount: string;
  }): Promise<{
    currentAllowance: string;
    requiredAmount: string;
    displayAllowance?: string;
    displayRequiredAmount?: string;
    sufficient: boolean;
  }>;
}
const defaults: FundingReadinessDependencies = {
  verifySender: (chainId) => verifyKeeperHub(undefined, undefined, chainId),
  balance: getProtectionFunding,
  allowance: getAaveAllowance,
};

export async function assessFundingReadiness(
  input: { chainId: number; candidate: CandidateAction; expectedSender?: string | null },
  dependencies: FundingReadinessDependencies = defaults,
): Promise<FundingReadiness> {
  const requiredAsset = input.candidate.assetSymbol ?? input.candidate.asset;
  const requiredAmount = input.candidate.tokenAmount ?? input.candidate.amount;
  const base = {
    requiredAsset,
    requiredAmount,
    availableBalance: null,
    currentAllowance: null,
    requiredAllowance: requiredAmount,
    sender: input.expectedSender ?? null,
  };
  if (requiredAsset !== "USDC" && requiredAsset !== "WETH")
    return { ...base, state: "UNSUPPORTED_ASSET", reason: "UNSUPPORTED_ASSET" };
  const expected = input.expectedSender ?? process.env.KEEPERHUB_EXECUTION_WALLET;
  if (!expected)
    return { ...base, state: "SENDER_MISMATCH", reason: "EXECUTION_WALLET_NOT_CONFIGURED" };
  let keeper;
  try {
    keeper = await dependencies.verifySender(input.chainId);
  } catch (error) {
    return {
      ...base,
      sender: expected,
      state:
        error instanceof KeeperHubReadError && error.code.includes("MISMATCH")
          ? "SENDER_MISMATCH"
          : "KEEPERHUB_UNAVAILABLE",
      reason:
        error instanceof KeeperHubReadError && error.code.includes("MISMATCH")
          ? "SENDER_MISMATCH"
          : "KEEPERHUB_UNAVAILABLE",
    };
  }
  if (!keeper.capabilities.simulation)
    return {
      ...base,
      sender: keeper.reportedWallet,
      state: "KEEPERHUB_UNAVAILABLE",
      reason: "SIMULATION_UNAVAILABLE",
    };
  if (!keeper.capabilities.broadcast)
    return {
      ...base,
      sender: keeper.reportedWallet,
      state: "KEEPERHUB_UNAVAILABLE",
      reason: "BROADCAST_UNAVAILABLE",
    };
  if (!isAddressEqual(keeper.reportedWallet as `0x${string}`, expected as `0x${string}`))
    return {
      ...base,
      sender: keeper.reportedWallet,
      state: "SENDER_MISMATCH",
      reason: "SENDER_MISMATCH",
    };
  const funding = await dependencies.balance({
    chainId: input.chainId,
    assetSymbol: requiredAsset,
    sender: expected as `0x${string}`,
    amount: requiredAmount,
  });
  if (!funding.sufficient)
    return {
      ...base,
      sender: expected,
      availableBalance: funding.balance ?? funding.balanceUnits,
      requiredAllowance: funding.requiredAmount ?? funding.requiredUnits,
      state: "INSUFFICIENT_BALANCE",
      reason: "INSUFFICIENT_FUNDING",
    };
  const allowance = await dependencies.allowance({
    chainId: input.chainId,
    assetSymbol: requiredAsset,
    sender: expected as `0x${string}`,
    amount: requiredAmount,
  });
  if (!allowance.sufficient)
    return {
      ...base,
      sender: expected,
      availableBalance: funding.balance ?? funding.balanceUnits,
      currentAllowance: allowance.displayAllowance ?? allowance.currentAllowance,
      requiredAllowance: allowance.displayRequiredAmount ?? allowance.requiredAmount,
      state: "INSUFFICIENT_ALLOWANCE",
      reason: "ALLOWANCE_REQUIRED",
    };
  return {
    ...base,
    sender: expected,
    availableBalance: funding.balance ?? funding.balanceUnits,
    currentAllowance: allowance.displayAllowance ?? allowance.currentAllowance,
    requiredAllowance: allowance.displayRequiredAmount ?? allowance.requiredAmount,
    state: "READY",
    reason: null,
  };
}

export async function selectExecutableCandidate(
  input: {
    chainId: number;
    candidates: CandidateAction[];
    expectedSender?: string | null;
    allowApproval?: boolean;
  },
  assess: typeof assessFundingReadiness = assessFundingReadiness,
) {
  const rejected: Array<{ candidateId: string; readiness: FundingReadiness }> = [];
  for (const candidate of [...input.candidates].sort((a, b) => a.rank - b.rank)) {
    if (!candidate.valid || (candidate.requiresApproval && !input.allowApproval)) continue;
    const readiness = await assess({
      chainId: input.chainId,
      candidate,
      expectedSender: input.expectedSender,
    });
    if (readiness.state === "READY") return { candidate, readiness, rejected };
    rejected.push({ candidateId: candidate.id, readiness });
  }
  return { candidate: null, readiness: rejected.at(-1)?.readiness ?? null, rejected };
}
