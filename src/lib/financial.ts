import { z } from "zod";
export const SCALE = 1_000_000n;
export const decimalSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,23})(\.\d{1,6})?$/,
    "Use a nonnegative decimal string with at most 6 fractional digits",
  );
export function units(value: string): bigint {
  const [whole, fraction = ""] = decimalSchema.parse(value).split(".");
  return BigInt(whole!) * SCALE + BigInt(fraction.padEnd(6, "0"));
}
export function decimal(value: bigint): string {
  if (value < 0n) throw new Error("Negative financial value");
  return `${value / SCALE}.${(value % SCALE).toString().padStart(6, "0")}`;
}
export function ceilDiv(n: bigint, d: bigint): bigint {
  if (n < 0n || d <= 0n) throw new Error("Invalid division");
  return (n + d - 1n) / d;
}
