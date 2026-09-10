import "server-only";
import { createPublicClient, decodeEventLog, http, isAddressEqual, parseAbi, type Address, type Hex } from "viem";
import { base, baseSepolia } from "viem/chains";
import { getChain } from "../chains/config";
import type { AaveIntent } from "../aave/intents";
import { ProtectionExecutionError } from "./types";
const events = parseAbi(["event Repay(address indexed reserve,address indexed user,address indexed repayer,uint256 amount,bool useATokens)", "event Supply(address indexed reserve,address user,address indexed onBehalfOf,uint256 amount,uint16 indexed referralCode)"]);
export interface ChainProof { transactionHash: string; blockNumber: string; eventName: "Repay" | "Supply"; amount: string }
export async function verifyAaveTransaction(input: { chainId: number; transactionHash: string; expectedBlockNumber: number; intent: AaveIntent }): Promise<ChainProof> {
  const config = getChain(input.chainId), rpcUrl = process.env[config.rpcEnvKey]; if (!rpcUrl) throw new ProtectionExecutionError("RPC_NOT_CONFIGURED", "VERIFYING_RECEIPT");
  const chain = input.chainId === baseSepolia.id ? baseSepolia : base; const client = createPublicClient({ chain, transport: http(rpcUrl, { timeout: 20_000 }) }); const hash = input.transactionHash as Hex;
  const [receipt, transaction] = await Promise.all([client.getTransactionReceipt({ hash }), client.getTransaction({ hash })]);
  if (receipt.status !== "success" || receipt.blockNumber !== BigInt(input.expectedBlockNumber)) throw new ProtectionExecutionError("RPC_RECEIPT_NOT_SUCCESSFUL", "VERIFYING_RECEIPT");
  // KeeperHub may route a write through a sponsored smart account. A direct Pool call must
  // match sender/calldata; a wrapped call is proven by the exact Pool event below.
  if (transaction.to && isAddressEqual(transaction.to, config.aavePoolAddress) && (!isAddressEqual(transaction.from, input.intent.expectedSender) || transaction.input.toLowerCase() !== input.intent.calldata.toLowerCase())) throw new ProtectionExecutionError("TRANSACTION_EFFECT_MISMATCH", "VERIFYING_RECEIPT");
  const expectedName = input.intent.action === "REPAY_DEBT" ? "Repay" : "Supply";
  for (const log of receipt.logs) {
    if (!isAddressEqual(log.address, config.aavePoolAddress)) continue;
    try {
      const decoded = decodeEventLog({ abi: events, data: log.data, topics: log.topics, strict: true }); if (decoded.eventName !== expectedName) continue;
      const args = decoded.args as Record<string, unknown>; const reserve = args.reserve as Address, beneficiary = (expectedName === "Repay" ? args.user : args.onBehalfOf) as Address, amount = args.amount as bigint;
      if (!isAddressEqual(reserve, input.intent.asset) || !isAddressEqual(beneficiary, input.intent.request.beneficiary) || amount !== BigInt(input.intent.amountUnits)) continue;
      if (expectedName === "Repay" && !isAddressEqual(args.repayer as Address, input.intent.expectedSender)) continue;
      return { transactionHash: hash, blockNumber: receipt.blockNumber.toString(), eventName: expectedName, amount: amount.toString() };
    } catch { continue; }
  }
  throw new ProtectionExecutionError("AAVE_EVENT_NOT_FOUND", "VERIFYING_RECEIPT");
}
