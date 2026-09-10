import { classifyRpcError } from "../../src/lib/aave/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeFunctionData, parseAbi, zeroAddress, HttpRequestError, TimeoutError } from "viem";
import { buildAaveRepayIntent, buildAaveSupplyIntent, serializeAaveIntent, aaveIntentFingerprint, tokenAmountToUnits } from "../../src/lib/aave/intents";
import { compareAllowance, getAaveAllowance } from "../../src/lib/aave/allowance";
import { baseConfig, baseSepoliaConfig } from "../../src/lib/chains/config";
import { protectionAssets } from "../../src/lib/chains/assets";
import { buildZeroValueSelfTransfer } from "../../src/lib/keeperhub/preflight-intent";
import { keeperHubBaseSupport, scopeCapabilities, verifyKeeperHub } from "../../src/lib/keeperhub/verification";
import { createKeeperHubReader } from "../../src/lib/keeperhub/client";
import { verifyBaseRpc } from "../../src/lib/verification/rpc";
import { verifyEnvironment } from "../../src/lib/verification/environment";
import { readerFor, wallet } from "../fixtures/aave";
const sender = "0x0000000000000000000000000000000000000020";
const input = { chainId: baseConfig.chainId, assetSymbol: "USDC", amount: "1.25", beneficiary: wallet, sender };
const catalog = [{ chainId: baseConfig.chainId, name: "Base", chainType: "evm", isTestnet: false, isEnabled: true }];
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("trusted Aave intent builders", () => {
  it("uses the verified Base Sepolia Pool and Aave reserve USDC", () => {
    const intent = buildAaveRepayIntent({ ...input, chainId: baseSepoliaConfig.chainId });
    expect(intent.body.chainId).toBe(String(baseSepoliaConfig.chainId));
    expect(intent.body.contractAddress).toBe(baseSepoliaConfig.aavePoolAddress);
    expect(intent.asset).toBe(protectionAssets[baseSepoliaConfig.chainId].USDC.address);
    expect(intent.asset).not.toBe("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
  });
  it("constructs the exact Base repayment path", () => {
    const intent = buildAaveRepayIntent(input);
    expect(intent.body.contractAddress).toBe(baseConfig.aavePoolAddress);
    expect(intent.body.functionName).toBe("repay");
    expect(intent.amountUnits).toBe("1250000");
    expect(JSON.parse(intent.body.functionArgs)).toEqual([protectionAssets[baseConfig.chainId].USDC.address, "1250000", "2", wallet]);
    expect(intent.expectedSender).toBe(sender);
    expect(intent.body.value).toBe("0");
  });
  it("uses the protected beneficiary, not the funding sender, for supply", () => {
    const intent = buildAaveSupplyIntent({ ...input, assetSymbol: "WETH", amount: "0.0001" });
    expect(intent.body.functionName).toBe("supply");
    expect(JSON.parse(intent.body.functionArgs)).toEqual([protectionAssets[baseConfig.chainId].WETH.address, "100000000000000", wallet, "0"]);
    expect(decodeFunctionData({ abi: parseAbi(["function supply(address,uint256,address,uint16)"]), data: intent.calldata }).args?.[2]).toBe(wallet);
  });
  it("encodes variable rate 2 and beneficiary into repay calldata", () => {
    const intent = buildAaveRepayIntent(input);
    expect(decodeFunctionData({ abi: parseAbi(["function repay(address,uint256,uint256,address) returns (uint256)"]), data: intent.calldata }).args).toEqual([protectionAssets[baseConfig.chainId].USDC.address, 1250000n, 2n, wallet]);
  });
  it("normalizes equivalent token amounts for stable serialization", () => {
    const a = buildAaveRepayIntent({ ...input, amount: "1.0" }), b = buildAaveRepayIntent({ ...input, amount: "1.000000" });
    expect(serializeAaveIntent(a)).toBe(serializeAaveIntent(b)); expect(aaveIntentFingerprint(a)).toBe(aaveIntentFingerprint(b));
  });
  it("binds the effect fingerprint to the expected sender", () => expect(aaveIntentFingerprint(buildAaveRepayIntent(input))).not.toBe(aaveIntentFingerprint(buildAaveRepayIntent({ ...input, sender: wallet }))));
  it("converts token decimals exactly", () => { expect(tokenAmountToUnits("1.000001", 6)).toBe(1000001n); expect(tokenAmountToUnits("0.000000000000000001", 18)).toBe(1n); });
  it.each(["1.0000001", "1e2", "-1", "0", "Infinity"])("rejects invalid or lossy amount %s", amount => expect(() => buildAaveRepayIntent({ ...input, amount })).toThrow());
  it.each([{ chainId: 1 }, { assetSymbol: "UNKNOWN" }, { beneficiary: zeroAddress }, { sender: "bad" }, { contractAddress: zeroAddress }, { abi: "[]" }, { calldata: "0x" }])("rejects untrusted overrides %j", patch => expect(() => buildAaveRepayIntent({ ...input, ...patch })).toThrow());
  it("rejects a tampered serialized target", () => {
    const intent = buildAaveRepayIntent(input);
    expect(() => serializeAaveIntent({ ...intent, body: { ...intent.body, contractAddress: zeroAddress } })).toThrow("INTENT_TAMPERED");
  });
  it("only prepares a zero-value self-transfer", () => {
    const intent = buildZeroValueSelfTransfer({ chainId: baseConfig.chainId, sender });
    expect(intent.body).toEqual({ chainId: String(baseConfig.chainId), recipientAddress: sender, amount: "0" });
    expect(intent.requiresExplicitBroadcastAuthorization).toBe(true);
    expect(() => buildZeroValueSelfTransfer({ chainId: baseConfig.chainId, sender, amount: "1" })).toThrow();
  });
});
describe("allowance checks", () => {
  it("allows exact allowance", () => expect(compareAllowance(100n, 100n).sufficient).toBe(true));
  it("rejects insufficient allowance", () => expect(compareAllowance(99n, 100n).sufficient).toBe(false));
  it("queries the sender allowance to the verified Pool", async () => {
    const r = readerFor(), read = r.read;
    const spy = vi.fn(async (q: Parameters<typeof read>[0]) => q.functionName === "allowance" ? 1250000n : read(q)); r.read = spy;
    const result = await getAaveAllowance({ chainId: baseConfig.chainId, sender, assetSymbol: "USDC", amount: "1.25" }, r);
    expect(result.sufficient).toBe(true); expect(result.currentAllowance).toBe("1250000");
    expect(spy.mock.calls.find(([q]) => q.functionName === "allowance")?.[0].args).toEqual([sender, baseConfig.aavePoolAddress]);
  });
});
describe("read-only KeeperHub verification", () => {
  it("parses enabled Base from a catalog", () => expect(keeperHubBaseSupport(catalog, baseConfig.chainId).chainId).toBe(baseConfig.chainId));
  it("accepts Base Sepolia testnet", () => expect(keeperHubBaseSupport([{ ...catalog[0], chainId: baseSepoliaConfig.chainId, isTestnet: true }], baseSepoliaConfig.chainId).chainId).toBe(baseSepoliaConfig.chainId));
  it("accepts numeric-string chain IDs", () => expect(keeperHubBaseSupport([{ ...catalog[0], chainId: String(baseConfig.chainId) }], baseConfig.chainId).chainId).toBe(baseConfig.chainId));
  it.each([[], [{ ...catalog[0], isEnabled: false }], [{ ...catalog[0], isTestnet: true }], [...catalog, ...catalog]].map(rows => ({ rows })))("rejects unsupported or ambiguous Base", ({ rows }) => expect(() => keeperHubBaseSupport(rows, baseConfig.chainId)).toThrow());
  it("distinguishes read scope from write scope", () => { expect(scopeCapabilities("mcp:read")).toMatchObject({ known: true, simulation: true, broadcast: false }); expect(scopeCapabilities("mcp:write").broadcast).toBe(true); expect(scopeCapabilities("mcp:admin").broadcast).toBe(true); });
  it("does not infer unknown scopes", () => expect(scopeCapabilities(undefined).known).toBe(false));
  it("reports documented unscoped keys as unrestricted", () => expect(scopeCapabilities(null)).toMatchObject({ unrestricted: true, simulation: true, broadcast: true }));
  it("authenticates with keys before trusting the public catalog", async () => {
    vi.stubEnv("KEEPERHUB_EXECUTION_WALLET", "");
    const get = vi.fn(async (path: string) => path.startsWith("/api/keys") ? { items: [{ keyPrefix: "kh_test1", scope: "mcp:read" }], meta: { totalPages: 1 } } : path === "/api/chains" ? catalog : path === "/api/user" ? { walletAddress: sender } : { hasWallet: true, walletAddress: sender, organizationId: "org_test", isActive: true });
    const result = await verifyKeeperHub({ get }, "kh_test1_test", baseConfig.chainId);
    expect(get.mock.calls[0]?.[0]).toBe("/api/keys?page=1&limit=50");
    expect(result.reportedWallet).toBe(sender); expect(result.capabilities.broadcast).toBe(false); expect(result.senderRouteVerified).toBe(false); expect(result.phase3Ready).toBe(false);
    expect(get.mock.calls.every(([path]) => !path.startsWith("/api/execute"))).toBe(true);
  });
  it("does not treat a successful catalog as successful authentication", async () => {
    const get = vi.fn().mockRejectedValue(new Error("unauthorized"));
    await expect(verifyKeeperHub({ get }, "kh_test1_test", baseConfig.chainId)).rejects.toThrow(); expect(get).toHaveBeenCalledTimes(1);
  });
  it("refuses arbitrary hosts before attaching credentials", () => { vi.stubEnv("KEEPERHUB_API_KEY", "kh_test1_test"); vi.stubEnv("KEEPERHUB_BASE_URL", "https://attacker.invalid"); expect(() => createKeeperHubReader()).toThrow("KEEPERHUB_BASE_URL_NOT_ALLOWED"); });
  it("cannot request a broadcast endpoint", async () => {
    vi.stubEnv("KEEPERHUB_API_KEY", "kh_test1_test"); vi.stubEnv("KEEPERHUB_BASE_URL", "https://app.keeperhub.com");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const reader = createKeeperHubReader(); await expect(reader.get("/api/execute/transfer" as "/api/chains")).rejects.toThrow("READ_PATH_NOT_ALLOWED"); expect(fetch).not.toHaveBeenCalled();
  });
});
describe("environment and RPC verification", () => {
  it("recognizes the Base Sepolia environment and default chain", () => {
    const result = verifyEnvironment({ BASE_SEPOLIA_RPC_URL: "https://sepolia.base.org", POSITIONGUARD_DEFAULT_CHAIN_ID: "84532" });
    expect(result.BASE_SEPOLIA_RPC_URL).toBe("VALID_FORMAT");
    expect(result.POSITIONGUARD_DEFAULT_CHAIN_ID).toBe("VALID_FORMAT");
  });
  it("safely rejects malformed URLs without exposing their contents", () => {
    const result = verifyEnvironment({ DATABASE_URL: "invalid-secret-value", BASE_RPC_URL: "invalid-secret-rpc" });
    expect(result.DATABASE_URL).toBe("INVALID_FORMAT");
    expect(result.BASE_RPC_URL).toBe("INVALID_FORMAT");
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("reports only environment status, not secrets", () => { const result = verifyEnvironment({ DATABASE_URL: "postgresql://user:secret@localhost/db" }); expect(result.DATABASE_URL).toBe("VALID_FORMAT"); expect(result.BASE_RPC_URL).toBe("MISSING"); expect(JSON.stringify(result)).not.toContain("secret"); });
  it("fails immediately on Base RPC chain mismatch", async () => { const reader = readerFor(); reader.chainId = async () => 1; await expect(verifyBaseRpc(reader, baseConfig.chainId)).rejects.toMatchObject({ code: "NETWORK_MISMATCH" }); });
  it("rejects malformed blocks", async () => { const reader = readerFor(); reader.block = async () => ({ number: 1n, timestamp: 1n, hash: "0x1234" }); await expect(verifyBaseRpc(reader, baseConfig.chainId)).rejects.toMatchObject({ code: "MALFORMED_RPC_RESULT" }); });
});


describe("sanitized RPC failure categories", () => {
  it("reports HTTP rate limits without leaking RPC URLs", () => {
    const result = classifyRpcError(new HttpRequestError({ status: 429, url: "https://rpc.invalid/secret" }));
    expect(result.code).toBe("RPC_RATE_LIMITED"); expect(result.message).not.toContain("secret");
  });
  it("reports RPC timeouts distinctly", () => expect(classifyRpcError(new TimeoutError({ url: "https://rpc.invalid/secret", body: {} })).code).toBe("RPC_TIMEOUT"));
  it("reports malformed JSON distinctly", () => expect(classifyRpcError(new SyntaxError("secret response")).code).toBe("MALFORMED_RPC_RESULT"));
});
