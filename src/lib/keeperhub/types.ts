import { z } from "zod";
import { walletSchema } from "../security/position-input";
export const chainCatalogSchema = z
  .array(
    z.object({
      chainId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/).transform(Number)]),
      name: z.string(),
      chainType: z.string(),
      isEnabled: z.boolean(),
      isTestnet: z.boolean(),
    }),
  )
  .max(1000);
export const keyPageSchema = z.object({
  items: z.array(
    z.object({ keyPrefix: z.string().min(1), scope: z.string().nullable().optional() }),
  ),
  meta: z.object({ totalPages: z.number().int().nonnegative() }),
});
export const walletResponseSchema = z.discriminatedUnion("hasWallet", [
  z.object({ hasWallet: z.literal(false) }),
  z.object({
    hasWallet: z.literal(true),
    walletAddress: walletSchema,
    organizationId: z.string().min(1),
    isActive: z.boolean(),
  }),
]);
export const profileSchema = z.object({ walletAddress: walletSchema.nullable() });
export class KeeperHubReadError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus?: number,
  ) {
    super(code);
    this.name = "KeeperHubReadError";
  }
}
