import "server-only";
import { isAddressEqual } from "viem";
import { getDefaultChain, getChain } from "../chains/config";
import { walletSchema } from "../security/position-input";
import { chainCatalogSchema, keyPageSchema, walletResponseSchema, profileSchema, KeeperHubReadError } from "./types";
import { createKeeperHubReader, keeperHubConfiguration, type KeeperHubReader } from "./client";
export function keeperHubChainSupport(input: unknown, chainId = getDefaultChain().chainId) {
  const chain = getChain(chainId);
  const rows = chainCatalogSchema.parse(input).filter(c => c.chainId === chain.chainId);
  if (rows.length !== 1 || !rows[0]!.isEnabled || rows[0]!.isTestnet !== chain.testnet || rows[0]!.chainType !== "evm") throw new KeeperHubReadError("KEEPERHUB_CHAIN_NOT_ENABLED");
  return rows[0]!;
}
export const keeperHubBaseSupport = keeperHubChainSupport;
export function scopeCapabilities(scope: string | null | undefined) {
  if (scope === undefined) return { known: false, simulation: null, broadcast: null, unrestricted: null };
  const scopes = new Set((scope ?? "").split(/\s+/).filter(Boolean));
  const unrestricted = scopes.size === 0;
  return { known: true, simulation: unrestricted || scopes.has("mcp:read") || scopes.has("mcp:write") || scopes.has("mcp:admin"),
    broadcast: unrestricted || scopes.has("mcp:write") || scopes.has("mcp:admin"), unrestricted };
}
export async function verifyKeeperHub(readerOverride?: KeeperHubReader, keyOverride?: string, chainId = getDefaultChain().chainId) {
  const apiKey = keyOverride ?? keeperHubConfiguration().apiKey, reader = readerOverride ?? createKeeperHubReader();
  let matchingScopes: (string | null | undefined)[] = [], pagesComplete = true;
  // /chains is public and cannot authenticate the caller. /keys must succeed first.
  for (let page = 1; page <= 10; page++) {
    const keys = keyPageSchema.parse(await reader.get(`/api/keys?page=${page}&limit=50`));
    matchingScopes = matchingScopes.concat(keys.items.filter(k => k.keyPrefix === apiKey.slice(0, 8)).map(k => k.scope));
    if (page >= keys.meta.totalPages) break;
    if (page === 10) pagesComplete = false;
  }
  const chain = keeperHubChainSupport(await reader.get("/api/chains"), chainId);
  const [walletRaw, profileRaw] = await Promise.all([reader.get("/api/user/wallet"), reader.get("/api/user")]);
  const wallet = walletResponseSchema.parse(walletRaw), profile = profileSchema.parse(profileRaw);
  if (!wallet.hasWallet || !wallet.isActive) throw new KeeperHubReadError("KEEPERHUB_WALLET_NOT_CONFIGURED");
  if (!profile.walletAddress || !isAddressEqual(wallet.walletAddress, profile.walletAddress)) throw new KeeperHubReadError("KEEPERHUB_WALLET_MISMATCH");
  const expected = process.env.KEEPERHUB_EXECUTION_WALLET;
  if (expected && !isAddressEqual(walletSchema.parse(expected), wallet.walletAddress)) throw new KeeperHubReadError("KEEPERHUB_EXPECTED_SENDER_MISMATCH");
  const capabilities = scopeCapabilities(pagesComplete && matchingScopes.length === 1 ? matchingScopes[0] : undefined);
  return { authenticated: true, chain, organizationId: wallet.organizationId, reportedWallet: wallet.walletAddress,
    expectedSenderMatched: expected ? true : null, capabilities,
    senderRouteVerified: false, phase3Ready: false,
    note: "Wallet APIs identify the organization wallet; they do not prove EOA versus Safe broadcast routing. Verify route and simulation sender before funding/execution. No simulation or broadcast performed." };
}
