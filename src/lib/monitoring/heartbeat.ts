import "server-only";
import { getPrisma } from "../db/prisma";

export const DEFAULT_WORKER_NAME = "monitoring";
export const WORKER_HEARTBEAT_INTERVAL_MS = 10_000;

export function workerName() {
  return process.env.WORKER_NAME?.trim() || DEFAULT_WORKER_NAME;
}

export async function recordWorkerHeartbeat(input: {
  chainId: number;
  instanceId: string;
  startedAt: Date;
  at?: Date;
  workerName?: string;
}) {
  const name = input.workerName ?? workerName();
  const at = input.at ?? new Date();
  return getPrisma().workerHeartbeat.upsert({
    where: { chainId_workerName: { chainId: input.chainId, workerName: name } },
    create: {
      chainId: input.chainId,
      workerName: name,
      instanceId: input.instanceId,
      startedAt: input.startedAt,
      lastHeartbeatAt: at,
    },
    update: {
      instanceId: input.instanceId,
      startedAt: input.startedAt,
      lastHeartbeatAt: at,
    },
  });
}

export function readWorkerHeartbeat(chainId: number) {
  return getPrisma().workerHeartbeat.findUnique({
    where: { chainId_workerName: { chainId, workerName: workerName() } },
  });
}
