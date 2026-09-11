import { maxUint256, zeroAddress, type Address } from "viem";
import { baseConfig } from "../../src/lib/chains/config";
import type { ChainConfig } from "../../src/lib/chains/types";
import type { AaveReader, RawAccount, RawReserve, ReadRequest } from "../../src/lib/aave/types";
import { ceilDiv } from "../../src/lib/financial";
export const wallet = "0x0000000000000000000000000000000000000010";
export const baseUnit = 100_000_000n;
export function reserve(index: number, supplied: bigint, debt: bigint, lt = 8000n): RawReserve {
  return {
    asset: `0x${index.toString(16).padStart(40, "0")}` as Address,
    symbol: `TOKEN${index}`,
    decimals: 6,
    walletBalance: 500_000_000n,
    suppliedBalance: supplied * 1_000_000n,
    variableDebt: debt * 1_000_000n,
    stableDebt: 0n,
    collateralEnabled: supplied > 0n,
    price: baseUnit,
    liquidationThresholdBps: lt,
    active: true,
    paused: false,
    frozen: false,
    debtCeiling: 0n,
    supplyCapacity: null,
  };
}
export const reserves = [
  reserve(1, 1000n, 0n, 8000n),
  reserve(2, 500n, 0n, 6000n),
  reserve(3, 0n, 600n),
  reserve(4, 0n, 400n),
];
export function accountFor(rows: readonly RawReserve[]): RawAccount {
  let collateral = 0n,
    weighted = 0n,
    debt = 0n;
  for (const r of rows) {
    const unit = 10n ** BigInt(r.decimals);
    if (r.collateralEnabled) {
      const c = (r.suppliedBalance * r.price) / unit;
      collateral += c;
      weighted += c * r.liquidationThresholdBps;
    }
    debt += ceilDiv((r.variableDebt + r.stableDebt) * r.price, unit);
  }
  return {
    totalCollateralBase: collateral,
    totalDebtBase: debt,
    availableBorrowsBase: 0n,
    currentLiquidationThreshold: collateral === 0n ? 0n : weighted / collateral,
    ltv: 7000n,
    healthFactor: debt === 0n ? maxUint256 : (weighted * 10n ** 18n) / (debt * 10000n),
  };
}
export function readerFor(
  rows: readonly RawReserve[] = reserves,
  chain: ChainConfig = baseConfig,
): AaveReader & { calls: ReadRequest[] } {
  const account = accountFor(rows),
    calls: ReadRequest[] = [];
  const read = async (request: ReadRequest): Promise<unknown> => {
    calls.push(request);
    const r =
      rows.find(
        (r) => r.asset.toLowerCase() === String(request.args?.[0] ?? request.address).toLowerCase(),
      ) ?? rows.find((r) => r.asset.toLowerCase() === request.address.toLowerCase());
    switch (request.functionName) {
      case "getPool":
        return chain.aavePoolAddress;
      case "getPriceOracle":
        return chain.aaveOracleAddress;
      case "getPoolDataProvider":
        return chain.aavePoolDataProviderAddress;
      case "ADDRESSES_PROVIDER":
        return chain.aaveAddressesProviderAddress;
      case "BASE_CURRENCY":
        return zeroAddress;
      case "BASE_CURRENCY_UNIT":
        return baseUnit;
      case "getUserAccountData":
        return Object.values(account);
      case "getUserEMode":
        return 0n;
      case "getReservesList":
        return rows.map((r) => r.asset);
      case "getUserReserveData":
        return [
          r!.suppliedBalance,
          r!.stableDebt,
          r!.variableDebt,
          0n,
          0n,
          0n,
          0n,
          0,
          r!.collateralEnabled,
        ];
      case "balanceOf":
        return r!.walletBalance;
      case "symbol":
        return r!.symbol;
      case "decimals":
        return r!.decimals;
      case "getReserveConfigurationData":
        return [
          BigInt(r!.decimals),
          7000n,
          r!.liquidationThresholdBps,
          10500n,
          1000n,
          true,
          true,
          false,
          r!.active,
          r!.frozen,
        ];
      case "getAssetPrice":
        return r!.price;
      case "getPaused":
        return r!.paused;
      case "getDebtCeiling":
        return r!.debtCeiling;
      case "getReserveCaps":
        return [0n, 0n];
      case "getATokenTotalSupply":
        return 0n;
      default:
        throw new Error(`Unexpected read: ${request.functionName}`);
    }
  };
  return {
    calls,
    read,
    chainId: async () => chain.chainId,
    code: async () => "0x6000",
    block: async () => ({
      number: 12345678n,
      hash: `0x${"ab".repeat(32)}`,
      timestamp: 1788854400n,
    }),
  };
}
