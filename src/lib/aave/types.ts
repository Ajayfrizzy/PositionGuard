import type { Abi, Address, Hex } from "viem";
import type { PortfolioPosition } from "../protection/portfolio-types";
export interface ReadRequest {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  blockNumber: bigint;
}
export interface AaveReader {
  chainId(): Promise<number>;
  block(blockNumber?: bigint): Promise<{ number: bigint; hash: Hex; timestamp: bigint }>;
  code(address: Address, blockNumber: bigint): Promise<Hex | undefined>;
  read(request: ReadRequest): Promise<unknown>;
}
export interface RawAccount {
  totalCollateralBase: bigint;
  totalDebtBase: bigint;
  availableBorrowsBase: bigint;
  currentLiquidationThreshold: bigint;
  ltv: bigint;
  healthFactor: bigint;
}
export interface RawReserve {
  asset: Address;
  symbol: string;
  decimals: number;
  walletBalance: bigint;
  suppliedBalance: bigint;
  variableDebt: bigint;
  stableDebt: bigint;
  collateralEnabled: boolean;
  price: bigint;
  liquidationThresholdBps: bigint;
  active: boolean;
  frozen: boolean;
  paused: boolean;
  debtCeiling: bigint;
  supplyCapacity: bigint | null;
}
export interface ReservePosition {
  asset: Address;
  symbol: string;
  decimals: number;
  walletBalance: string;
  suppliedBalance: string;
  variableDebt: string;
  stableDebt: string;
  walletBalanceUsd: string;
  suppliedUsd: string;
  debtUsd: string;
  collateralEnabled: boolean;
  liquidationThreshold: string;
  priceBase: string;
  raw: { walletBalance: string; suppliedBalance: string; variableDebt: string; stableDebt: string };
}
export interface AavePosition {
  wallet: Address;
  chain: { chainId: number; name: string; testnet: boolean; blockExplorerBaseUrl: string };
  account: {
    healthFactor: string | null;
    healthFactorWad: string;
    totalCollateralUsd: string;
    totalDebtUsd: string;
    availableBorrowsUsd: string;
    currentLiquidationThreshold: string;
    ltv: string;
    eModeCategory: string;
    raw: Record<keyof RawAccount, string>;
  };
  reserves: ReservePosition[];
  walletProtectionBalances: ReservePosition[];
  normalizedProtectionInput: PortfolioPosition;
  analysisBlockers: string[];
  blockNumber: string;
  blockHash: Hex;
  blockTimestamp: string;
  fetchedAt: string;
  baseCurrencyUnit: string;
}
