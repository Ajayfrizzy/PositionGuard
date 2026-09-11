import { z } from "zod";
import { getAddress, isAddress } from "viem";
import { chains } from "../chains/config";
export const walletSchema = z
  .string()
  .refine((v) => isAddress(v, { strict: true }), "Invalid EVM wallet address")
  .transform((v) => getAddress(v));
export const positionQuerySchema = z.strictObject({
  address: walletSchema,
  chainId: z.coerce
    .number()
    .int()
    .refine((v) => Object.hasOwn(chains, v), "Unsupported chain"),
});
