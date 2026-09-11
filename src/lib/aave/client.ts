import {
  BaseError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  LimitExceededRpcError,
  HttpRequestError,
  TimeoutError,
  createPublicClient,
  http,
  isAddressEqual,
  zeroAddress,
  type Address,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import { z } from "zod";
import type { ChainConfig } from "../chains/types";
import { getChain } from "../chains/config";
import { AaveReadError } from "./errors";
import { providerAbi, dataProviderAbi, oracleAbi } from "./abis";
import { uint } from "./calculations";
import type { AaveReader } from "./types";
export function createAaveReader(config: ChainConfig, signal?: AbortSignal): AaveReader {
  getChain(config.chainId);
  const url = process.env[config.rpcEnvKey];
  if (!url) throw new AaveReadError("RPC_NOT_CONFIGURED");
  const parsed = z.url().safeParse(url);
  if (!parsed.success || !/^https?:/.test(url)) throw new AaveReadError("RPC_NOT_CONFIGURED");
  const chain = config.chainId === baseSepolia.id ? baseSepolia : base;
  const client = createPublicClient({
    chain,
    transport: http(url, {
      timeout: 10_000,
      retryCount: 1,
      retryDelay: 300,
      batch: { batchSize: 5 },
      fetchOptions: { signal },
    }),
  });
  return {
    chainId: async () => {
      try {
        const id = await client.getChainId();
        if (!Number.isSafeInteger(id) || id <= 0) throw new AaveReadError("MALFORMED_RPC_RESULT");
        return id;
      } catch (error) {
        throw classifyRpcError(error);
      }
    },
    block: async (blockNumber) => {
      try {
        const b = await client.getBlock(
          blockNumber === undefined ? { blockTag: "latest" } : { blockNumber },
        );
        if (
          typeof b.number !== "bigint" ||
          b.number < 0n ||
          typeof b.timestamp !== "bigint" ||
          b.timestamp <= 0n ||
          !b.hash ||
          !/^0x[0-9a-fA-F]{64}$/.test(b.hash)
        )
          throw new AaveReadError("MALFORMED_RPC_RESULT");
        return { number: b.number, hash: b.hash, timestamp: b.timestamp };
      } catch (error) {
        throw classifyRpcError(error);
      }
    },
    code: async (address, blockNumber) => {
      try {
        const code = await client.getCode({ address, blockNumber });
        if (code !== undefined && !/^0x(?:[0-9a-fA-F]{2})*$/.test(code))
          throw new AaveReadError("MALFORMED_RPC_RESULT");
        return code;
      } catch (error) {
        throw classifyRpcError(error);
      }
    },
    read: async (request) => {
      try {
        return await client.readContract(request);
      } catch (error) {
        throw classifyRpcError(error);
      }
    },
  };
}
export function classifyRpcError(error: unknown): AaveReadError {
  if (error instanceof AaveReadError) return error;
  if (error instanceof SyntaxError) return new AaveReadError("MALFORMED_RPC_RESULT");
  if (error instanceof BaseError) {
    if (
      error.walk(
        (e) =>
          e instanceof LimitExceededRpcError || (e instanceof HttpRequestError && e.status === 429),
      )
    )
      return new AaveReadError("RPC_RATE_LIMITED");
    if (
      error.walk(
        (e) =>
          e instanceof TimeoutError ||
          (e instanceof Error && ["AbortError", "TimeoutError"].includes(e.name)),
      )
    )
      return new AaveReadError("RPC_TIMEOUT");
    if (
      error.walk(
        (e) =>
          e instanceof ContractFunctionRevertedError || e instanceof ContractFunctionZeroDataError,
      )
    )
      return new AaveReadError("AAVE_CALL_FAILED");
  }
  return new AaveReadError("RPC_UNAVAILABLE");
}
export async function verifyNetwork(
  reader: AaveReader,
  config: ChainConfig,
  blockNumber: bigint,
): Promise<bigint> {
  if ((await reader.chainId()) !== config.chainId) throw new AaveReadError("NETWORK_MISMATCH");
  const contracts = [
    config.aavePoolAddress,
    config.aavePoolDataProviderAddress,
    config.aaveAddressesProviderAddress,
    config.aaveOracleAddress,
  ];
  const codes = await Promise.all(contracts.map((a) => reader.code(a, blockNumber)));
  if (codes.some((code) => !code || code === "0x")) throw new AaveReadError("CONTRACT_MISMATCH");
  const read = (
    address: Address,
    abi: typeof providerAbi | typeof oracleAbi | typeof dataProviderAbi,
    functionName: string,
  ) => reader.read({ address, abi, functionName, blockNumber });
  const [pool, oracle, provider, owner, currency, unit] = await Promise.all([
    read(config.aaveAddressesProviderAddress, providerAbi, "getPool"),
    read(config.aaveAddressesProviderAddress, providerAbi, "getPriceOracle"),
    read(config.aaveAddressesProviderAddress, providerAbi, "getPoolDataProvider"),
    read(config.aavePoolDataProviderAddress, dataProviderAbi, "ADDRESSES_PROVIDER"),
    read(config.aaveOracleAddress, oracleAbi, "BASE_CURRENCY"),
    read(config.aaveOracleAddress, oracleAbi, "BASE_CURRENCY_UNIT"),
  ]);
  const pairs = [
    [pool, config.aavePoolAddress],
    [oracle, config.aaveOracleAddress],
    [provider, config.aavePoolDataProviderAddress],
    [owner, config.aaveAddressesProviderAddress],
    [currency, zeroAddress],
  ] as const;
  for (const [actual, expected] of pairs) {
    if (
      typeof actual !== "string" ||
      !/^0x[0-9a-fA-F]{40}$/.test(actual) ||
      !isAddressEqual(actual as Address, expected)
    )
      throw new AaveReadError("CONTRACT_MISMATCH");
  }
  if (uint(unit) !== 100_000_000n) throw new AaveReadError("PRICE_NORMALIZATION_FAILED");
  return uint(unit);
}
