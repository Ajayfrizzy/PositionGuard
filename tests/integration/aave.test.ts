import { describe, expect, it, vi, afterEach } from "vitest";
import { getAavePosition } from "../../src/lib/aave/service";
import { handlePositionRequest } from "../../src/lib/aave/http";
import { previewPolicy } from "../../src/lib/aave/analysis";
import { readerFor, reserves, wallet } from "../fixtures/aave";
import { baseSepoliaConfig } from "../../src/lib/chains/config";
afterEach(() => vi.unstubAllEnvs());
describe("real read adapter with contract fixtures", () => {
  it("runs the same normalized read path on Base Sepolia", async () => {
    const p = await getAavePosition({ walletAddress: wallet, chainId: baseSepoliaConfig.chainId }, readerFor(reserves, baseSepoliaConfig));
    expect(p.chain).toMatchObject({ chainId: 84532, name: "Base Sepolia", testnet: true });
    expect(p.account.healthFactor).toBe("1.1");
    expect(p.normalizedProtectionInput.model).toBe("portfolio-v2");
  });
  it("reads account/reserves coherently at one block", async () => { const reader = readerFor(); const p = await getAavePosition({ walletAddress: wallet, chainId: 8453 }, reader); expect(p.account.totalCollateralUsd).toBe("1500"); expect(p.account.totalDebtUsd).toBe("1000"); expect(p.account.healthFactor).toBe("1.1"); expect(p.reserves).toHaveLength(4); expect(p.walletProtectionBalances).toHaveLength(4); expect(reader.calls.every(c => c.blockNumber === 12345678n)).toBe(true); });
  it("handles no-position wallets without metadata fetches", async () => { const rows = reserves.map(r => ({ ...r, suppliedBalance: 0n, variableDebt: 0n, walletBalance: 0n, collateralEnabled: false })); const reader = readerFor(rows); const p = await getAavePosition({ walletAddress: wallet, chainId: 8453 }, reader); expect(p.account.healthFactor).toBeNull(); expect(p.reserves).toHaveLength(0); expect(reader.calls.some(c => c.functionName === "symbol")).toBe(false); });
  it("rejects invalid wallet before RPC", async () => { const r = readerFor(); await expect(getAavePosition({ walletAddress: "bad", chainId: 8453 }, r)).rejects.toMatchObject({ code: "INVALID_ADDRESS" }); expect(r.calls).toHaveLength(0); });
  it("rejects unsupported chain", async () => await expect(getAavePosition({ walletAddress: wallet, chainId: 1 }, readerFor())).rejects.toMatchObject({ code: "UNSUPPORTED_CHAIN" }));
  it("fails closed on RPC failure", async () => { const r = readerFor(); r.block = async () => { throw new Error("secret RPC URL"); }; await expect(getAavePosition({ walletAddress: wallet, chainId: 8453 }, r)).rejects.toMatchObject({ code: "RPC_UNAVAILABLE" }); });
  it("rejects wrong RPC chain", async () => { const r = readerFor(); r.chainId = async () => 1; await expect(getAavePosition({ walletAddress: wallet, chainId: 8453 }, r)).rejects.toMatchObject({ code: "NETWORK_MISMATCH" }); });
  it("rejects missing contract code", async () => { const r = readerFor(); r.code = async () => "0x"; await expect(getAavePosition({ walletAddress: wallet, chainId: 8453 }, r)).rejects.toMatchObject({ code: "CONTRACT_MISMATCH" }); });
  it.each([["getUserAccountData", [1n], "MALFORMED_RPC_RESULT"], ["getReservesList", [], "EMPTY_RESERVE_LIST"], ["symbol", "", "TOKEN_METADATA_FAILED"], ["getAssetPrice", 0n, "PRICE_NORMALIZATION_FAILED"]])("rejects invalid %s", async (method, value, code) => { const r = readerFor(); const original = r.read; r.read = q => q.functionName === method ? Promise.resolve(value) : original(q); await expect(getAavePosition({ walletAddress: wallet, chainId: 8453 }, r)).rejects.toMatchObject({ code }); });
  it("detects block hash changes", async () => { const r = readerFor(); const original = r.block; r.block = async n => ({ ...await original(n), ...(n === undefined ? {} : { hash: `0x${"cd".repeat(32)}` as const }) }); await expect(getAavePosition({ walletAddress: wallet, chainId: 8453 }, r)).rejects.toMatchObject({ code: "STATE_CHANGED" }); });
});
describe("authenticated position endpoint", () => {
  const token = "a".repeat(32);
  const getPosition = (input: { walletAddress: string; chainId: number }) => getAavePosition(input, readerFor());
  const request = (method = "GET", auth = true) => new Request(`http://localhost/api/positions/aave?address=${wallet}&chainId=8453`, { method, headers: { ...(auth ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, ...(method === "POST" ? { body: JSON.stringify({ address: wallet, chainId: 8453, policy: previewPolicy }) } : {}) });
  it("fails closed when token is unconfigured", async () => { vi.stubEnv("POSITIONGUARD_DEV_TOKEN", ""); const res = await handlePositionRequest(request(), { getPosition, persist: vi.fn() }); expect(res.status).toBe(503); });
  it("rejects unauthenticated reads", async () => { vi.stubEnv("POSITIONGUARD_DEV_TOKEN", token); const read = vi.fn(getPosition); const res = await handlePositionRequest(request("GET", false), { getPosition: read, persist: vi.fn() }); expect(res.status).toBe(401); expect(read).not.toHaveBeenCalled(); });
  it("GET reads without snapshot persistence", async () => { vi.stubEnv("POSITIONGUARD_DEV_TOKEN", token); const persist = vi.fn(); const res = await handlePositionRequest(request(), { getPosition, persist }); expect(res.status).toBe(200); expect(persist).not.toHaveBeenCalled(); expect((await res.json()).snapshotId).toBeNull(); });
  it("deliberate POST persists once", async () => { vi.stubEnv("POSITIONGUARD_DEV_TOKEN", token); const persist = vi.fn().mockResolvedValue("snapshot1"); const res = await handlePositionRequest(request("POST"), { getPosition, persist }); expect(res.status).toBe(200); expect(persist).toHaveBeenCalledTimes(1); expect((await res.json()).snapshotId).toBe("snapshot1"); });
  it("reports persistence failure honestly", async () => { vi.stubEnv("POSITIONGUARD_DEV_TOKEN", token); const persist = vi.fn().mockRejectedValue(new Error("database password")); const res = await handlePositionRequest(request("POST"), { getPosition, persist }); expect(res.status).toBe(503); expect(await res.text()).not.toContain("password"); });
  it("does not expose stack traces or RPC credentials", async () => { vi.stubEnv("POSITIONGUARD_DEV_TOKEN", token); const res = await handlePositionRequest(request(), { getPosition: vi.fn().mockRejectedValue(new Error("https://rpc/secret")), persist: vi.fn() }); expect(res.status).toBe(503); expect(await res.text()).not.toContain("secret"); });
});

describe("viem RPC error boundary", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("redacts transport errors", async () => {
    vi.stubEnv("BASE_RPC_URL", "https://rpc.invalid/secret");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret")));
    const { createAaveReader } = await import("../../src/lib/aave/client");
    const { baseConfig } = await import("../../src/lib/chains/config");
    const { poolAbi } = await import("../../src/lib/aave/abis");
    await expect(createAaveReader(baseConfig).read({ address: baseConfig.aavePoolAddress, abi: poolAbi, functionName: "getReservesList", blockNumber: 1n })).rejects.toMatchObject({ code: "RPC_UNAVAILABLE", message: "RPC_UNAVAILABLE" });
  });
  it("fails closed without a configured RPC", async () => {
    vi.stubEnv("BASE_RPC_URL", "");
    await expect(getAavePosition({ walletAddress: wallet, chainId: 8453 })).rejects.toMatchObject({ code: "RPC_NOT_CONFIGURED" });
  });
});
