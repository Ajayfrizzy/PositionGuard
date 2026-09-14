import "dotenv/config";
import { runMonitoringWorker } from "../src/lib/monitoring/worker";
import {
  recordWorkerHeartbeat,
  WORKER_HEARTBEAT_INTERVAL_MS,
  workerEnvironment,
  workerName,
} from "../src/lib/monitoring/heartbeat";
import { getDefaultChain } from "../src/lib/chains/config";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

const requested = Number(process.env.MONITOR_POLL_INTERVAL_MS ?? 60_000);
const intervalMs = Number.isFinite(requested) ? Math.max(30_000, Math.floor(requested)) : 60_000;
const once = process.argv.includes("--once");
let stopping = false;
const shutdown = new AbortController();
const stop = (signal: string) => {
  stopping = true;
  shutdown.abort();
  console.log(
    JSON.stringify({
      level: "info",
      event: "monitoring-worker-stopping",
      signal,
      timestamp: new Date().toISOString(),
    }),
  );
};
process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
const heartbeat = process.env.WORKER_HEARTBEAT_PATH;
async function touchFileHeartbeat() {
  if (!heartbeat) return;
  await mkdir(dirname(heartbeat), { recursive: true });
  await writeFile(heartbeat, new Date().toISOString());
}
const chainId = getDefaultChain().chainId;
const instanceId = randomUUID();
const workerStartedAt = new Date();
let heartbeatUpdate: Promise<void> | null = null;
async function touchHeartbeat() {
  if (heartbeatUpdate) return heartbeatUpdate;
  heartbeatUpdate = Promise.all([
    touchFileHeartbeat(),
    recordWorkerHeartbeat({ chainId, instanceId, startedAt: workerStartedAt }),
  ])
    .then(() => undefined)
    .catch((error) => {
      console.error(
        JSON.stringify({
          level: "error",
          event: "worker-heartbeat-error",
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
    })
    .finally(() => {
      heartbeatUpdate = null;
    });
  return heartbeatUpdate;
}
console.log(
  JSON.stringify({
    level: "info",
    event: "monitoring-worker-started",
    intervalMs,
    heartbeatIntervalMs: WORKER_HEARTBEAT_INTERVAL_MS,
    chainId,
    workerName: workerName(),
    workerEnvironment: workerEnvironment(),
    instanceId,
    timestamp: new Date().toISOString(),
  }),
);

await touchHeartbeat();
const heartbeatTimer = setInterval(() => void touchHeartbeat(), WORKER_HEARTBEAT_INTERVAL_MS);
await runMonitoringWorker({
  once,
  intervalMs,
  shouldStop: () => stopping,
  wait: (milliseconds) =>
    new Promise((resolve) => {
      const timer = setTimeout(resolve, milliseconds);
      shutdown.signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    }),
  cycle: async () => {
    const startedAt = new Date().toISOString();
    try {
      const results = await import("../src/lib/monitoring/service").then((module) =>
        module.runAllMonitoringCycles(),
      );
      console.log(
        JSON.stringify({
          level: "info",
          event: "monitoring-cycle",
          startedAt,
          completedAt: new Date().toISOString(),
          accounts: results.length,
          failed: results.filter((item) => !item.ok).length,
        }),
      );
      return results;
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "monitoring-worker-error",
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
      return [];
    }
  },
});
clearInterval(heartbeatTimer);
await heartbeatUpdate;
console.log(
  JSON.stringify({
    level: "info",
    event: "monitoring-worker-stopped",
    timestamp: new Date().toISOString(),
  }),
);
