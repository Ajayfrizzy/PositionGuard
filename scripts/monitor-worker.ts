import "dotenv/config";
import { runMonitoringWorker } from "../src/lib/monitoring/worker";

const requested = Number(process.env.MONITOR_POLL_INTERVAL_MS ?? 60_000);
const intervalMs = Number.isFinite(requested) ? Math.max(30_000, Math.floor(requested)) : 60_000;
const once = process.argv.includes("--once");
let stopping = false;
process.once("SIGINT", () => { stopping = true; });
process.once("SIGTERM", () => { stopping = true; });

await runMonitoringWorker({ once, intervalMs, shouldStop: () => stopping, cycle: async () => { const startedAt = new Date().toISOString(); try { const results = await import("../src/lib/monitoring/service").then(module => module.runAllMonitoringCycles()); console.log(JSON.stringify({ event: "monitoring-cycle", startedAt, completedAt: new Date().toISOString(), accounts: results.length, failed: results.filter(item => !item.ok).length })); return results; } catch (error) { console.error(JSON.stringify({ event: "monitoring-worker-error", error: error instanceof Error ? error.message : "unknown" })); return []; } } });
