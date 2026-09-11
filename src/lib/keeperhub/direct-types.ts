import { z } from "zod";
import { walletSchema } from "../security/position-input";

const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
export const simulationResponseSchema = z.strictObject({
  success: z.literal(true),
  status: z.literal("simulated"),
  from: walletSchema,
  to: walletSchema,
  value: z.string().regex(/^\d+$/),
  gasEstimate: z.string().regex(/^[1-9]\d*$/),
  simulatedReturnValue: z.unknown().nullable().optional(),
  wouldRevert: z.literal(false),
});
export const broadcastResponseSchema = z.object({
  executionId: z.string().min(1).max(128),
  status: z.string().min(1),
  transactionHash: hash.optional(),
  transactionLink: z.string().url().optional(),
  idempotentReplay: z.literal(true).optional(),
});
export const receiptSchema = z.object({
  hash,
  chainId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/).transform(Number)]),
  verified: z.boolean(),
  receiptStatus: z.enum(["success", "reverted", "safe_inner_failure", "not_found", "timeout"]),
  blockNumber: z.union([
    z.number().int().nonnegative(),
    z.string().regex(/^\d+$/).transform(Number),
  ]),
  gasUsed: z.string().regex(/^\d+$/),
});
export const statusResponseSchema = z.object({
  executionId: z.string().min(1),
  status: z.string().min(1),
  transactionHash: hash.nullish(),
  transactionLink: z.string().url().nullish(),
  receipts: z.array(receiptSchema),
  error: z.unknown().nullable().optional(),
  completedAt: z.string().datetime().nullish(),
});
export type KeeperHubSimulation = z.infer<typeof simulationResponseSchema>;
export type KeeperHubStatus = z.infer<typeof statusResponseSchema>;

export class KeeperHubExecutionError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(code);
    this.name = "KeeperHubExecutionError";
  }
}
