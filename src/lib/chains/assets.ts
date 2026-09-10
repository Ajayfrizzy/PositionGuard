import { z } from "zod";
import { baseConfig, baseSepoliaConfig, getChain } from "./config";
// Official Aave DAO address book values; runtime RPC verification checks metadata and reserve membership.
export const assetSymbolSchema = z.enum(["USDC", "WETH"]);
export const protectionAssets = {
  [baseConfig.chainId]: {
    USDC: { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    WETH: { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
  },
  [baseSepoliaConfig.chainId]: {
    USDC: { symbol: "USDC", address: "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f", decimals: 6 },
    WETH: { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
  },
} as const;
export function getProtectionAsset(chainId: number, symbol: unknown) {
  getChain(chainId);
  const assets = protectionAssets[chainId as keyof typeof protectionAssets];
  if (!assets) throw new Error("UNSUPPORTED_CHAIN");
  return assets[assetSymbolSchema.parse(symbol)];
}
