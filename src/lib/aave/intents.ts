import "server-only";
import {
  encodeFunctionData,
  formatUnits,
  keccak256,
  maxUint256,
  parseAbi,
  parseUnits,
  stringToHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { z } from "zod";
import { getChain } from "../chains/config";
import { assetSymbolSchema, getProtectionAsset } from "../chains/assets";
import { walletSchema } from "../security/position-input";
const nonzeroWallet = walletSchema.refine((v) => v !== zeroAddress, "Wallet cannot be zero");
const intentInputSchema = z.strictObject({
  chainId: z.number().int().positive(),
  assetSymbol: assetSymbolSchema,
  amount: z.string().regex(/^(0|[1-9]\d{0,77})(\.\d{1,36})?$/),
  beneficiary: nonzeroWallet,
  sender: nonzeroWallet,
});
const repayAbi = parseAbi([
  "function repay(address asset,uint256 amount,uint256 interestRateMode,address onBehalfOf) returns (uint256)",
]);
const supplyAbi = parseAbi([
  "function supply(address asset,uint256 amount,address onBehalfOf,uint16 referralCode)",
]);
export type AaveIntentInput = z.infer<typeof intentInputSchema>;
export interface AaveIntent {
  readonly action: "REPAY_DEBT" | "ADD_COLLATERAL";
  readonly request: Readonly<AaveIntentInput>;
  readonly asset: Address;
  readonly amountUnits: string;
  readonly expectedSender: Address;
  readonly calldata: Hex;
  readonly body: Readonly<{
    chainId: string;
    contractAddress: Address;
    functionName: "repay" | "supply";
    functionArgs: string;
    abi: string;
    value: "0";
  }>;
}
export function tokenAmountToUnits(amount: string, decimals: number): bigint {
  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 36 ||
    !/^(0|[1-9]\d{0,77})(\.\d+)?$/.test(amount)
  )
    throw new Error("INVALID_TOKEN_AMOUNT");
  if ((amount.split(".")[1]?.length ?? 0) > decimals) throw new Error("EXCESS_TOKEN_PRECISION");
  const value = parseUnits(amount, decimals);
  if (value <= 0n || value >= maxUint256) throw new Error("INVALID_TOKEN_AMOUNT");
  return value;
}
function build(action: AaveIntent["action"], input: unknown): AaveIntent {
  const parsed = intentInputSchema.parse(input),
    chain = getChain(parsed.chainId),
    asset = getProtectionAsset(parsed.chainId, parsed.assetSymbol);
  const units = tokenAmountToUnits(parsed.amount, asset.decimals);
  const request = Object.freeze({ ...parsed, amount: formatUnits(units, asset.decimals) });
  const repayment = action === "REPAY_DEBT";
  const abi = repayment ? repayAbi : supplyAbi;
  const functionArgs = repayment
    ? [asset.address, units.toString(), "2", request.beneficiary]
    : [asset.address, units.toString(), request.beneficiary, "0"];
  const calldata = repayment
    ? encodeFunctionData({
        abi: repayAbi,
        functionName: "repay",
        args: [asset.address, units, 2n, request.beneficiary],
      })
    : encodeFunctionData({
        abi: supplyAbi,
        functionName: "supply",
        args: [asset.address, units, request.beneficiary, 0],
      });
  return Object.freeze({
    action,
    request,
    asset: asset.address,
    amountUnits: units.toString(),
    expectedSender: request.sender,
    calldata,
    body: Object.freeze({
      chainId: String(chain.chainId),
      contractAddress: chain.aavePoolAddress,
      functionName: repayment ? "repay" : "supply",
      functionArgs: JSON.stringify(functionArgs),
      abi: JSON.stringify(abi),
      value: "0",
    }),
  });
}
export const buildAaveRepayIntent = (input: unknown): AaveIntent => build("REPAY_DEBT", input);
export const buildAaveSupplyIntent = (input: unknown): AaveIntent => build("ADD_COLLATERAL", input);
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function checkedIntent(intent: AaveIntent): string {
  if (!["REPAY_DEBT", "ADD_COLLATERAL"].includes(intent.action))
    throw new Error("UNSUPPORTED_ACTION");
  const rebuilt = build(intent.action, intent.request);
  if (canonical(rebuilt) !== canonical(intent)) throw new Error("INTENT_TAMPERED");
  return canonical(rebuilt);
}
export function serializeAaveIntent(intent: AaveIntent): string {
  checkedIntent(intent);
  return canonical(intent.body);
}
export function aaveIntentFingerprint(intent: AaveIntent): Hex {
  return keccak256(stringToHex(checkedIntent(intent)));
}
