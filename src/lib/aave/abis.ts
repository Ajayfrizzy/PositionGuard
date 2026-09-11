import { parseAbi } from "viem";
// Read-only fragments from Aave V3 IPool, IPoolDataProvider and oracle interfaces.
export const poolAbi = parseAbi([
  "function getUserAccountData(address user) view returns (uint256,uint256,uint256,uint256,uint256,uint256)",
  "function getReservesList() view returns (address[])",
  "function getUserEMode(address user) view returns (uint256)",
]);
export const providerAbi = parseAbi([
  "function getPool() view returns (address)",
  "function getPriceOracle() view returns (address)",
  "function getPoolDataProvider() view returns (address)",
]);
export const dataProviderAbi = parseAbi([
  "function ADDRESSES_PROVIDER() view returns (address)",
  "function getUserReserveData(address asset,address user) view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint40,bool)",
  "function getReserveConfigurationData(address asset) view returns (uint256,uint256,uint256,uint256,uint256,bool,bool,bool,bool,bool)",
  "function getPaused(address asset) view returns (bool)",
  "function getDebtCeiling(address asset) view returns (uint256)",
  "function getReserveCaps(address asset) view returns (uint256,uint256)",
  "function getATokenTotalSupply(address asset) view returns (uint256)",
]);
export const oracleAbi = parseAbi([
  "function BASE_CURRENCY_UNIT() view returns (uint256)",
  "function BASE_CURRENCY() view returns (address)",
  "function getAssetPrice(address asset) view returns (uint256)",
]);
export const tokenAbi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);
