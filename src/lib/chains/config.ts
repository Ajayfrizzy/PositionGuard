import type { ChainConfig } from "./types";
export const baseConfig = {
  chainId: 8453,
  name: "Base mainnet",
  testnet: false,
  rpcEnvKey: "BASE_RPC_URL",
  aavePoolAddress: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
  aavePoolDataProviderAddress: "0x0F43731EB8d45A581f4a36DD74F5f358bc90C73A",
  aaveAddressesProviderAddress: "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D",
  aaveOracleAddress: "0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156",
  blockExplorerBaseUrl: "https://basescan.org",
  keeperHubSupported: true,
} as const satisfies ChainConfig;
export const baseSepoliaConfig = {
  chainId: 84532,
  name: "Base Sepolia",
  testnet: true,
  rpcEnvKey: "BASE_SEPOLIA_RPC_URL",
  aavePoolAddress: "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27",
  aavePoolDataProviderAddress: "0xBc9f5b7E248451CdD7cA54e717a2BFe1F32b566b",
  aaveAddressesProviderAddress: "0xE4C23309117Aa30342BFaae6c95c6478e0A4Ad00",
  aaveOracleAddress: "0x943b0dE18d4abf4eF02A85912F8fc07684C141dF",
  blockExplorerBaseUrl: "https://sepolia.basescan.org",
  keeperHubSupported: true,
} as const satisfies ChainConfig;
export const chains: Readonly<Record<number, ChainConfig>> = {
  [baseConfig.chainId]: baseConfig,
  [baseSepoliaConfig.chainId]: baseSepoliaConfig,
};
export const DEFAULT_CHAIN_ID = baseSepoliaConfig.chainId;
export function getChain(chainId: number): ChainConfig {
  const config = chains[chainId];
  if (!config) throw new Error("UNSUPPORTED_CHAIN");
  return config;
}
export function getDefaultChain(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ChainConfig {
  const raw = env.POSITIONGUARD_DEFAULT_CHAIN_ID?.trim();
  if (!raw) return baseSepoliaConfig;
  if (!/^\d+$/.test(raw)) throw new Error("INVALID_DEFAULT_CHAIN");
  try {
    return getChain(Number(raw));
  } catch {
    throw new Error("INVALID_DEFAULT_CHAIN");
  }
}
