import { formatUnits } from "viem";
import { getChain } from "../chains/config";
import { walletSchema } from "../security/position-input";
import { createAaveReader, verifyNetwork } from "./client";
import { readAccount } from "./account";
import { readReserves } from "./reserves";
import { baseUsd, healthFactorFromWad, tokenValueBase, uint } from "./calculations";
import { normalizeAavePosition, formatThreshold } from "./normalizer";
import { poolAbi } from "./abis";
import { AaveReadError } from "./errors";
import type { AavePosition, AaveReader, RawAccount } from "./types";
export async function getAavePosition(
  input: { walletAddress: string; chainId: number },
  readerOverride?: AaveReader,
): Promise<AavePosition> {
  const parsed = walletSchema.safeParse(input.walletAddress);
  if (!parsed.success) throw new AaveReadError("INVALID_ADDRESS");
  let config;
  try {
    config = getChain(input.chainId);
  } catch {
    throw new AaveReadError("UNSUPPORTED_CHAIN");
  }
  const wallet = parsed.data;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const reader = readerOverride ?? createAaveReader(config, controller.signal);
    const work = async (): Promise<AavePosition> => {
      const block = await reader.block();
      const baseUnit = await verifyNetwork(reader, config, block.number);
      const [account, reserves, eModeRaw] = await Promise.all([
        readAccount(reader, config.aavePoolAddress, wallet, block.number),
        readReserves(reader, config, wallet, block.number),
        reader.read({
          address: config.aavePoolAddress,
          abi: poolAbi,
          functionName: "getUserEMode",
          args: [wallet],
          blockNumber: block.number,
        }),
      ]);
      const eMode = uint(eModeRaw);
      const endBlock = await reader.block(block.number);
      if (endBlock.hash !== block.hash) throw new AaveReadError("STATE_CHANGED");
      const normalizedProtectionInput = normalizeAavePosition(account, reserves, baseUnit, eMode);
      const positions = reserves.map((r) => ({
        asset: r.asset,
        symbol: r.symbol,
        decimals: r.decimals,
        walletBalance: formatUnits(r.walletBalance, r.decimals),
        suppliedBalance: formatUnits(r.suppliedBalance, r.decimals),
        variableDebt: formatUnits(r.variableDebt, r.decimals),
        stableDebt: formatUnits(r.stableDebt, r.decimals),
        walletBalanceUsd: baseUsd(tokenValueBase(r.walletBalance, r.price, r.decimals), baseUnit),
        suppliedUsd: baseUsd(tokenValueBase(r.suppliedBalance, r.price, r.decimals), baseUnit),
        debtUsd: baseUsd(
          tokenValueBase(r.variableDebt + r.stableDebt, r.price, r.decimals),
          baseUnit,
        ),
        collateralEnabled: r.collateralEnabled,
        liquidationThreshold: formatThreshold(r.liquidationThresholdBps),
        priceBase: r.price.toString(),
        raw: {
          walletBalance: r.walletBalance.toString(),
          suppliedBalance: r.suppliedBalance.toString(),
          variableDebt: r.variableDebt.toString(),
          stableDebt: r.stableDebt.toString(),
        },
      }));
      const raw = Object.fromEntries(
        Object.entries(account).map(([key, value]) => [key, value.toString()]),
      ) as Record<keyof RawAccount, string>;
      return {
        wallet,
        chain: {
          chainId: config.chainId,
          name: config.name,
          testnet: config.testnet,
          blockExplorerBaseUrl: config.blockExplorerBaseUrl,
        },
        account: {
          healthFactor: healthFactorFromWad(account.healthFactor, account.totalDebtBase),
          healthFactorWad: account.healthFactor.toString(),
          totalCollateralUsd: baseUsd(account.totalCollateralBase, baseUnit),
          totalDebtUsd: baseUsd(account.totalDebtBase, baseUnit),
          availableBorrowsUsd: baseUsd(account.availableBorrowsBase, baseUnit),
          currentLiquidationThreshold: formatThreshold(account.currentLiquidationThreshold),
          ltv: formatThreshold(account.ltv),
          eModeCategory: eMode.toString(),
          raw,
        },
        reserves: positions,
        walletProtectionBalances: positions.filter((r) => BigInt(r.raw.walletBalance) > 0n),
        normalizedProtectionInput,
        analysisBlockers: normalizedProtectionInput.analysisBlockers,
        blockNumber: block.number.toString(),
        blockHash: block.hash,
        blockTimestamp: block.timestamp.toString(),
        fetchedAt: new Date().toISOString(),
        baseCurrencyUnit: baseUnit.toString(),
      };
    };
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new AaveReadError("RPC_UNAVAILABLE"));
        }, 45_000);
      }),
    ]);
  } catch (error) {
    if (error instanceof AaveReadError) throw error;
    throw new AaveReadError("RPC_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
