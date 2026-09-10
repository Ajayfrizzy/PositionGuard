import "server-only";
import type { AaveIntent } from "../aave/intents";
import { keeperHubConfiguration } from "./client";
import { broadcastResponseSchema, KeeperHubExecutionError, simulationResponseSchema, statusResponseSchema, type KeeperHubSimulation, type KeeperHubStatus } from "./direct-types";

export interface KeeperHubDirectClient {
  simulate(intent: AaveIntent): Promise<KeeperHubSimulation>;
  broadcast(intent: AaveIntent, idempotencyKey: string): Promise<{ executionId: string; status: string; transactionHash?: string; transactionLink?: string; idempotentReplay?: true }>;
  status(executionId: string): Promise<{ result: KeeperHubStatus; pollAfterSeconds: number }>;
}

async function request(path: string, init: RequestInit) {
  const { apiKey, baseUrl } = keeperHubConfiguration();
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json", "Content-Type": "application/json", ...init.headers }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20_000) });
  let body: unknown; try { body = await response.json(); } catch { throw new KeeperHubExecutionError("KEEPERHUB_INVALID_RESPONSE", response.status); }
  if (!response.ok) {
    const record = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
    throw new KeeperHubExecutionError(typeof record.code === "string" ? record.code : "KEEPERHUB_HTTP_ERROR", response.status);
  }
  return { body, headers: response.headers, status: response.status };
}

export function createKeeperHubDirectClient(): KeeperHubDirectClient {
  return {
    async simulate(intent) { const { body } = await request("/api/execute/contract-call", { method: "POST", body: JSON.stringify({ ...intent.body, simulate: true }) }); return simulationResponseSchema.parse(body); },
    async broadcast(intent, idempotencyKey) {
      if (!/^[a-zA-Z0-9:_-]{16,128}$/.test(idempotencyKey)) throw new KeeperHubExecutionError("INVALID_IDEMPOTENCY_KEY");
      const { body, status } = await request("/api/execute/contract-call", { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify(intent.body) });
      if (status !== 202) throw new KeeperHubExecutionError("KEEPERHUB_BROADCAST_NOT_ACCEPTED", status);
      return broadcastResponseSchema.parse(body);
    },
    async status(executionId) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(executionId)) throw new KeeperHubExecutionError("INVALID_EXECUTION_ID");
      const response = await request(`/api/execute/${executionId}/status`, { method: "GET", headers: { "Content-Type": "application/json" } });
      const rawHint = response.headers.get("x-poll-interval-hint"); const hint = rawHint && /^\d+$/.test(rawHint) ? Number(rawHint) : 2;
      return { result: statusResponseSchema.parse(response.body), pollAfterSeconds: Math.min(30, hint) };
    },
  };
}

export function requireSuccessfulKeeperHubReceipt(status: KeeperHubStatus, chainId: number) {
  if (status.status !== "completed") throw new KeeperHubExecutionError(status.status === "unconfirmed" ? "KEEPERHUB_UNCONFIRMED" : "KEEPERHUB_EXECUTION_FAILED");
  if (!status.receipts.length) throw new KeeperHubExecutionError("KEEPERHUB_RECEIPT_MISSING");
  if (status.receipts.some(receipt => receipt.chainId !== chainId || !receipt.verified || receipt.receiptStatus !== "success")) throw new KeeperHubExecutionError("KEEPERHUB_RECEIPT_NOT_VERIFIED");
  const hashes = new Set(status.receipts.map(receipt => receipt.hash.toLowerCase()));
  if (hashes.size !== 1 || (status.transactionHash && !hashes.has(status.transactionHash.toLowerCase()))) throw new KeeperHubExecutionError("KEEPERHUB_RECEIPT_HASH_MISMATCH");
  return status.receipts[0]!;
}
