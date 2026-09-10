import type { Address } from "viem";
export interface ChainConfig {
  chainId: number;
  name: string;
  testnet: boolean;
  rpcEnvKey: "BASE_RPC_URL" | "BASE_SEPOLIA_RPC_URL";
  aavePoolAddress: Address;
  aavePoolDataProviderAddress: Address;
  aaveAddressesProviderAddress: Address;
  aaveOracleAddress: Address;
  blockExplorerBaseUrl: string;
  keeperHubSupported: boolean;
}
