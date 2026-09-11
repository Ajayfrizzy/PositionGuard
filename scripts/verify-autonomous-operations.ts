import "dotenv/config";
import { getDefaultChain } from "../src/lib/chains/config";
import { loadActiveProtectionPolicy } from "../src/lib/policies/active";
import { prepareLiveProtectionAnalysis } from "../src/lib/protection/live-preparation";
import { runMonitoringCycle } from "../src/lib/monitoring/service";
import { assessFundingReadiness } from "../src/lib/funding/readiness";
import { executeProtection } from "../src/lib/execution/orchestrator";
import { analyzeStress } from "../src/lib/stress/service";

const walletAddress = process.env.AAVE_WALLET_ADDRESS;
if (!walletAddress) throw new Error("AAVE_WALLET_ADDRESS_REQUIRED");
const chain = getDefaultChain();
const active = await loadActiveProtectionPolicy({ walletAddress, chainId: chain.chainId });
const monitoring = await runMonitoringCycle();
const prepared = await prepareLiveProtectionAnalysis({ walletAddress, chainId: chain.chainId });
const candidate = prepared.analysis.result.selectedCandidate;
const readiness = candidate
  ? await assessFundingReadiness({ chainId: chain.chainId, candidate })
  : null;
let simulation: Awaited<ReturnType<typeof executeProtection>> | null = null;
let simulationError: string | null = null;
try {
  simulation = await executeProtection({ mode: "simulate", walletAddress, chainId: chain.chainId });
} catch (error) {
  simulationError = error instanceof Error ? error.message : "SIMULATION_FAILED";
}
const stress = analyzeStress({
  position: prepared.position.normalizedProtectionInput,
  policy: active.policy,
  asset: "WETH",
  percentageShock: -10,
  context: {
    dailyAutonomousSpendUsd: "0",
    nowMs: Date.parse(prepared.position.fetchedAt),
    lastAutonomousExecutionAtMs: null,
  },
});
console.log(
  JSON.stringify(
    {
      ok: true,
      chainId: chain.chainId,
      walletAddress,
      executionMode: active.policy.executionMode,
      monitoring,
      fundingReadiness: readiness,
      stress: {
        currentHealthFactor: stress.currentHealthFactor,
        projectedHealthFactor: stress.projectedHealthFactor,
        projectedRisk: stress.projectedRisk,
        mei: stress.mei,
        requiredCapitalUsd: stress.requiredCapitalUsd,
        simulationOnly: stress.simulationOnly,
        onchainStateChanged: stress.onchainStateChanged,
      },
      autonomousPreparation: simulation
        ? {
            outcome: simulation.outcome,
            stage: simulation.stage,
            simulation: simulation.simulation,
            broadcastAttempted: false,
          }
        : { outcome: "BLOCKED", error: simulationError, broadcastAttempted: false },
    },
    null,
    2,
  ),
);
