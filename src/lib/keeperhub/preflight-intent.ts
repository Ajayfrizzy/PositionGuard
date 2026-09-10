import "server-only";
import { z } from "zod";
import { zeroAddress } from "viem";
import { walletSchema } from "../security/position-input";
import { getChain } from "../chains/config";
const schema = z.strictObject({ chainId: z.number().int(), sender: walletSchema.refine(a => a !== zeroAddress) });
export function buildZeroValueSelfTransfer(input: unknown) {
  const p = schema.parse(input), chain = getChain(p.chainId);
  return Object.freeze({ endpoint: "/api/execute/transfer" as const, requiresExplicitBroadcastAuthorization: true as const,
    expectedSender: p.sender, body: Object.freeze({ chainId: String(chain.chainId), recipientAddress: p.sender, amount: "0" as const }) });
}
