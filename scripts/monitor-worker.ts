import "dotenv/config";
import { runMonitoringWorker } from "../src/lib/monitoring/worker";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

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
async function touchHeartbeat() {
  if (!heartbeat) return;
  await mkdir(dirname(heartbeat), { recursive: true });
  await writeFile(heartbeat, new Date().toISOString());
}
console.log(
  JSON.stringify({
    level: "info",
    event: "monitoring-worker-started",
    intervalMs,
    timestamp: new Date().toISOString(),
  }),
);

await touchHeartbeat();
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
      await touchHeartbeat();
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
      await touchHeartbeat();
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
console.log(
  JSON.stringify({
    level: "info",
    event: "monitoring-worker-stopped",
    timestamp: new Date().toISOString(),
  }),
);
