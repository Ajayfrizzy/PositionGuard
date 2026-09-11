import { getAddress, type Address } from "viem";
import { z } from "zod";
import type { ChainConfig } from "../chains/types";
import { poolAbi, dataProviderAbi, tokenAbi, oracleAbi } from "./abis";
import { uint, uintSchema } from "./calculations";
import { AaveReadError } from "./errors";
import type { AaveReader, RawReserve } from "./types";
export async function mapBounded<T, R>(
  items: readonly T[],
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(6, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]!);
      }
    }),
  );
  return results;
}
export async function readReserves(
  reader: AaveReader,
  config: ChainConfig,
  wallet: Address,
  blockNumber: bigint,
): Promise<RawReserve[]> {
  const raw = await reader.read({
    address: config.aavePoolAddress,
    abi: poolAbi,
    functionName: "getReservesList",
    blockNumber,
  });
  const list = z
    .array(z.string().regex(/^0x[0-9a-fA-F]{40}$/))
    .max(128)
    .safeParse(raw);
  if (!list.success) throw new AaveReadError("MALFORMED_RPC_RESULT");
  if (!list.data.length) throw new AaveReadError("EMPTY_RESERVE_LIST");
  if (new Set(list.data.map((a) => a.toLowerCase())).size !== list.data.length)
    throw new AaveReadError("MALFORMED_RPC_RESULT");
  const reserves = await mapBounded(list.data, async (address) => {
    const asset = getAddress(address);
    const read = (functionName: string) =>
      reader.read({
        address: config.aavePoolDataProviderAddress,
        abi: dataProviderAbi,
        functionName,
        args: [asset],
        blockNumber,
      });
    const [userRaw, balance] = await Promise.all([
      reader.read({
        address: config.aavePoolDataProviderAddress,
        abi: dataProviderAbi,
        functionName: "getUserReserveData",
        args: [asset, wallet],
        blockNumber,
      }),
      reader.read({
        address: asset,
        abi: tokenAbi,
        functionName: "balanceOf",
        args: [wallet],
        blockNumber,
      }),
    ]);
    const user = z
      .tuple([
        uintSchema,
        uintSchema,
        uintSchema,
        uintSchema,
        uintSchema,
        uintSchema,
        uintSchema,
        z.union([uintSchema, z.number().int().nonnegative()]),
        z.boolean(),
      ])
      .safeParse(userRaw);
    if (!user.success) throw new AaveReadError("MALFORMED_RPC_RESULT");
    const [suppliedBalance, stableDebt, variableDebt] = user.data;
    const walletBalance = uint(balance);
    if (suppliedBalance + stableDebt + variableDebt + walletBalance === 0n) return null;
    const [configuration, symbol, decimals, price, paused, debtCeiling, caps, totalSupply] =
      await Promise.all([
        read("getReserveConfigurationData"),
        reader
          .read({ address: asset, abi: tokenAbi, functionName: "symbol", blockNumber })
          .catch(() => {
            throw new AaveReadError("TOKEN_METADATA_FAILED");
          }),
        reader
          .read({ address: asset, abi: tokenAbi, functionName: "decimals", blockNumber })
          .catch(() => {
            throw new AaveReadError("TOKEN_METADATA_FAILED");
          }),
        reader.read({
          address: config.aaveOracleAddress,
          abi: oracleAbi,
          functionName: "getAssetPrice",
          args: [asset],
          blockNumber,
        }),
        read("getPaused"),
        read("getDebtCeiling"),
        read("getReserveCaps"),
        read("getATokenTotalSupply"),
      ]);
    const cfg = z
      .tuple([
        uintSchema.max(36n),
        uintSchema.max(10000n),
        uintSchema.max(10000n),
        uintSchema,
        uintSchema,
        z.boolean(),
        z.boolean(),
        z.boolean(),
        z.boolean(),
        z.boolean(),
      ])
      .safeParse(configuration);
    if (!cfg.success || typeof paused !== "boolean")
      throw new AaveReadError("MALFORMED_RPC_RESULT");
    if (
      typeof symbol !== "string" ||
      !symbol.trim() ||
      symbol.length > 64 ||
      typeof decimals !== "number" ||
      !Number.isInteger(decimals) ||
      BigInt(decimals) !== cfg.data[0]
    )
      throw new AaveReadError("TOKEN_METADATA_FAILED");
    if (uint(price) === 0n) throw new AaveReadError("PRICE_NORMALIZATION_FAILED");
    const cap = z.tuple([uintSchema, uintSchema]).safeParse(caps);
    if (!cap.success) throw new AaveReadError("MALFORMED_RPC_RESULT");
    const max = cap.data[1] * 10n ** BigInt(decimals),
      used = uint(totalSupply);
    return {
      asset,
      symbol,
      decimals,
      walletBalance,
      suppliedBalance,
      stableDebt,
      variableDebt,
      collateralEnabled: user.data[8],
      price: uint(price),
      liquidationThresholdBps: cfg.data[2],
      active: cfg.data[8],
      frozen: cfg.data[9],
      paused,
      debtCeiling: uint(debtCeiling),
      supplyCapacity: max === 0n ? null : max > used ? max - used : 0n,
    } satisfies RawReserve;
  });
  return reserves.filter((r): r is RawReserve => r !== null);
}
