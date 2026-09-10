import "server-only";
import { parseAbi, type Address } from "viem";
import { z } from "zod";
import { getChain } from "../chains/config";
import { getProtectionAsset, assetSymbolSchema } from "../chains/assets";
import { walletSchema } from "../security/position-input";
import { createAaveReader, verifyNetwork } from "./client";
import { tokenAmountToUnits } from "./intents";
import { uint } from "./calculations";
import { AaveReadError } from "./errors";
import type { AaveReader } from "./types";
const allowanceAbi = parseAbi(["function allowance(address owner,address spender) view returns (uint256)"]);
const inputSchema = z.strictObject({ chainId: z.number().int(), assetSymbol: assetSymbolSchema, sender: walletSchema, amount: z.string() });
export function compareAllowance(currentAllowance: bigint, requiredAmount: bigint) {
  uint(currentAllowance); uint(requiredAmount);
  if (requiredAmount === 0n) throw new Error("INVALID_REQUIRED_AMOUNT");
  return { currentAllowance: currentAllowance.toString(), requiredAmount: requiredAmount.toString(), sufficient: currentAllowance >= requiredAmount };
}
export async function getAaveAllowance(input: unknown, readerOverride?: AaveReader) {
  const parsed = inputSchema.parse(input), chain = getChain(parsed.chainId), asset = getProtectionAsset(chain.chainId, parsed.assetSymbol);
  const required = tokenAmountToUnits(parsed.amount, asset.decimals);
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const reader = readerOverride ?? createAaveReader(chain, controller.signal), block = await reader.block();
    await verifyNetwork(reader, chain, block.number);
    const allowance = uint(await reader.read({ address: asset.address, abi: allowanceAbi, functionName: "allowance", args: [parsed.sender, chain.aavePoolAddress], blockNumber: block.number }));
    return { chainId: chain.chainId, asset: asset.address as Address, owner: parsed.sender, spender: chain.aavePoolAddress,
      blockNumber: block.number.toString(), ...compareAllowance(allowance, required) };
  } catch (error) { if (error instanceof AaveReadError) throw error; throw new AaveReadError("RPC_UNAVAILABLE"); }
  finally { clearTimeout(timer); controller.abort(); }
}
