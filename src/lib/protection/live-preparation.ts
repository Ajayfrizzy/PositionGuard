import "server-only";
import { getAavePosition } from "../aave/service";
import { analyzePosition } from "../aave/analysis";
import { loadActiveProtectionPolicy } from "../policies/active";

interface PreparationDependencies {
  loadPolicy: typeof loadActiveProtectionPolicy;
  getPosition: typeof getAavePosition;
}

const defaults: PreparationDependencies = {
  loadPolicy: loadActiveProtectionPolicy,
  getPosition: getAavePosition,
};

export async function prepareLiveProtectionAnalysis(
  input: { walletAddress: string; chainId: number },
  dependencies: PreparationDependencies = defaults,
) {
  const active = await dependencies.loadPolicy(input);
  const position = await dependencies.getPosition(input);
  return {
    policyId: active.policyId,
    policyUpdatedAt: active.policyUpdatedAt,
    policy: active.policy,
    position,
    analysis: analyzePosition(position, active.policy),
  };
}
