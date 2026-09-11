import "server-only";
import { runAllMonitoringCycles } from "./service";
export interface WorkerOptions {
  once?: boolean;
  intervalMs?: number;
  shouldStop?: () => boolean;
  cycle?: typeof runAllMonitoringCycles;
  wait?: (milliseconds: number) => Promise<void>;
}
export async function runMonitoringWorker(options: WorkerOptions = {}) {
  const intervalMs = Math.max(30_000, options.intervalMs ?? 60_000),
    cycle = options.cycle ?? runAllMonitoringCycles,
    wait =
      options.wait ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let cycles = 0;
  do {
    await cycle();
    cycles += 1;
    if (options.once || options.shouldStop?.()) break;
    await wait(intervalMs);
  } while (!options.shouldStop?.());
  return { cycles, intervalMs };
}
