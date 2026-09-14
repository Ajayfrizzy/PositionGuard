"use client";
import { createContext, useContext } from "react";
import type { WorkerStatus } from "@/lib/product/status";

export type LiveMonitoringState = {
  loaded: boolean;
  unavailable: boolean;
  policyEnabled: boolean;
  workerStatus: WorkerStatus;
  lastCheck: string | null;
};

const LiveMonitoringContext = createContext<LiveMonitoringState | null>(null);

export const LiveMonitoringProvider = LiveMonitoringContext.Provider;

export function useLiveMonitoring() {
  return useContext(LiveMonitoringContext);
}
