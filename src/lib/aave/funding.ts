import "server-only";
import { formatUnits, parseAbi } from "viem";
import { createAaveReader, verifyNetwork } from "./client";
import { getChain } from "../chains/config";
import { getProtectionAsset, assetSymbolSchema } from "../chains/assets";
import { walletSchema } from "../security/position-input";
import { tokenAmountToUnits } from "./intents";
import { z } from "zod";
import type { AaveReader } from "./types";
const inputSchema = z.strictObject({
  chainId: z.number().int(),
  assetSymbol: assetSymbolSchema,
  sender: walletSchema,
  amount: z.string(),
});
const balanceAbi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
export async function getProtectionFunding(input: unknown, readerOverride?: AaveReader) {
  const parsed = inputSchema.parse(input),
    chain = getChain(parsed.chainId),
    asset = getProtectionAsset(parsed.chainId, parsed.assetSymbol),
    required = tokenAmountToUnits(parsed.amount, asset.decimals);
  const reader = readerOverride ?? createAaveReader(chain);
  const block = await reader.block();
  await verifyNetwork(reader, chain, block.number);
  const raw = await reader.read({
    address: asset.address,
    abi: balanceAbi,
    functionName: "balanceOf",
    args: [parsed.sender],
    blockNumber: block.number,
  });
  const current = typeof raw === "bigint" ? raw : BigInt(String(raw));
  return {
    asset: asset.address,
    symbol: asset.symbol,
    balance: formatUnits(current, asset.decimals),
    balanceUnits: current.toString(),
    requiredUnits: required.toString(),
    sufficient: current >= required,
    blockNumber: block.number.toString(),
  };
}
