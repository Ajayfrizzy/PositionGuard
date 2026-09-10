import { isAddressEqual, zeroAddress } from "viem";
import { z } from "zod";
import { getDefaultChain, getChain } from "../chains/config";
import { assetSymbolSchema, getProtectionAsset } from "../chains/assets";
import { createAaveReader, verifyNetwork } from "../aave/client";
import { poolAbi, dataProviderAbi, tokenAbi } from "../aave/abis";
import { uint } from "../aave/calculations";
import { AaveReadError } from "../aave/errors";
import { walletSchema } from "../security/position-input";
import type { AaveReader } from "../aave/types";
export async function verifyBaseRpc(readerOverride?: AaveReader, chainId = getDefaultChain().chainId) {
  const chain = getChain(chainId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35_000);
  try {
    const reader = readerOverride ?? createAaveReader(chain, controller.signal);
    const actualChainId = await reader.chainId();
    if (actualChainId !== chain.chainId) throw new AaveReadError("NETWORK_MISMATCH");
    const block = await reader.block();
    const parsedBlock = z.object({ number: z.bigint().nonnegative(), timestamp: z.bigint().positive(), hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }).safeParse(block);
    if (!parsedBlock.success) throw new AaveReadError("MALFORMED_RPC_RESULT");
    const baseUnit = await verifyNetwork(reader, chain, block.number);
    const reserveRaw = await reader.read({ address: chain.aavePoolAddress, abi: poolAbi, functionName: "getReservesList", blockNumber: block.number });
    const reserves = z.array(walletSchema).min(1).max(128).safeParse(reserveRaw);
    if (!reserves.success) throw new AaveReadError("MALFORMED_RPC_RESULT");
    const tokens = [];
    for (const assetSymbol of assetSymbolSchema.options) {
      const token = getProtectionAsset(chain.chainId, assetSymbol);
      if (!reserves.data.some(a => isAddressEqual(a, token.address))) throw new AaveReadError("CONTRACT_MISMATCH");
      const [symbol, decimals, balance, config] = await Promise.all([
        reader.read({ address: token.address, abi: tokenAbi, functionName: "symbol", blockNumber: block.number }),
        reader.read({ address: token.address, abi: tokenAbi, functionName: "decimals", blockNumber: block.number }),
        reader.read({ address: token.address, abi: tokenAbi, functionName: "balanceOf", args: [zeroAddress], blockNumber: block.number }),
        reader.read({ address: chain.aavePoolDataProviderAddress, abi: dataProviderAbi, functionName: "getReserveConfigurationData", args: [token.address], blockNumber: block.number }),
      ]);
      if (symbol !== token.symbol || decimals !== token.decimals || !Array.isArray(config) || config[0] !== BigInt(token.decimals)) throw new AaveReadError("TOKEN_METADATA_FAILED");
      uint(balance);
      tokens.push({ symbol: token.symbol, address: token.address, decimals: token.decimals, erc20ReadVerified: true });
    }
    if ((await reader.block(block.number)).hash !== block.hash) throw new AaveReadError("STATE_CHANGED");
    return { working: true, chainId: actualChainId, network: chain.name, testnet: chain.testnet, blockNumber: block.number.toString(), blockHash: block.hash,
      baseCurrencyUnit: baseUnit.toString(), poolVerified: true, dataProviderVerified: true, tokens, verifiedAt: new Date().toISOString() };
  } catch (error) { if (error instanceof AaveReadError) throw error; throw new AaveReadError("RPC_UNAVAILABLE"); }
  finally { clearTimeout(timer); controller.abort(); }
}
