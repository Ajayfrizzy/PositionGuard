import type { Address } from "viem";
import { z } from "zod";
import { poolAbi } from "./abis";
import { uintSchema } from "./calculations";
import { AaveReadError } from "./errors";
import type { AaveReader, RawAccount } from "./types";
export async function readAccount(reader: AaveReader, pool: Address, wallet: Address, blockNumber: bigint): Promise<RawAccount> {
  const raw = await reader.read({ address: pool, abi: poolAbi, functionName: "getUserAccountData", args: [wallet], blockNumber });
  const tuple = z.tuple([uintSchema, uintSchema, uintSchema, uintSchema.max(10000n), uintSchema.max(10000n), uintSchema]).safeParse(raw);
  if (!tuple.success) throw new AaveReadError("MALFORMED_RPC_RESULT");
  const [totalCollateralBase, totalDebtBase, availableBorrowsBase, currentLiquidationThreshold, ltv, healthFactor] = tuple.data;
  return { totalCollateralBase, totalDebtBase, availableBorrowsBase, currentLiquidationThreshold, ltv, healthFactor };
}
