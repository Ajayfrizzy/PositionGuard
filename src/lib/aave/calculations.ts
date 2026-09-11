import { formatUnits, maxUint256 } from "viem";
import { z } from "zod";
import { AaveReadError } from "./errors";
export const uintSchema = z.bigint().min(0n).max(maxUint256);
export function uint(input: unknown): bigint {
  const result = uintSchema.safeParse(input);
  if (!result.success) throw new AaveReadError("MALFORMED_RPC_RESULT");
  return result.data;
}
export function healthFactorFromWad(value: bigint, debt: bigint): string | null {
  uint(value);
  uint(debt);
  if (debt === 0n) {
    if (value !== maxUint256) throw new AaveReadError("POSITION_INCONSISTENT");
    return null;
  }
  if (value === maxUint256) throw new AaveReadError("POSITION_INCONSISTENT");
  return formatUnits(value, 18);
}
export function baseUsd(value: bigint, baseUnit: bigint): string {
  if (baseUnit !== 100_000_000n) throw new AaveReadError("PRICE_NORMALIZATION_FAILED");
  return formatUnits(uint(value), 8);
}
export function tokenValueBase(amount: bigint, price: bigint, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36 || price <= 0n)
    throw new AaveReadError("PRICE_NORMALIZATION_FAILED");
  return (uint(amount) * uint(price)) / 10n ** BigInt(decimals);
}
