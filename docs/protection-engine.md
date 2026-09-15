# Deterministic protection engine

The protection engine is the authority for risk, candidates, policy, and Minimum Effective Intervention. It performs no network request and accepts normalized inputs from the Aave adapter or stress simulator.

## Risk model

Policies require target > warning > emergency > 1.

| Health factor                            | Risk     |
| ---------------------------------------- | -------- |
| At/above target, or no debt              | SAFE     |
| Warning inclusive to target exclusive    | WATCH    |
| Emergency inclusive to warning exclusive | HIGH     |
| Below emergency                          | CRITICAL |

Every below-target state is evaluated. SAFE returns NO_ACTION.

## Portfolio MEI

For each reserve, the engine considers variable-debt repayment when debt exists and add-collateral when the reserve is already eligible. Reserve-specific oracle price, decimals, debt, supply, wallet balance, liquidation threshold, and capacity are retained as integers.

The outcome estimator changes only the selected reserve effect. A bounded binary search finds the smallest token amount whose projected HF reaches target under this model. Candidate comparison uses exact rational capital values; rounded USD strings are for policy/display and are conservatively rounded.

Generated candidates include the minimum, adjacent/bounded comparison points, available balance, and autonomous cap. Each retains token amount/base units, estimated capital, projected HF, target attainment, policy validity, approval requirement, rejection reason, and deterministic rank.

Ranking prefers target attainment, policy compliance, lower capital, no approval, then repayment for an exact tie. The result is READY, REQUIRE_APPROVAL, NO_SAFE_ACTION, or NO_ACTION.

## Policy enforcement

The engine enforces policy enabled state, repay/supply permission, available balance, reserve supply capacity, maximum single amount, rolling daily amount, and cooldown. An eligible amount above approvalRequiredAboveUsd becomes approval-required.

Execution mode is applied by monitoring:

- MONITOR_ONLY observes without simulation/broadcast.
- REQUIRE_APPROVAL checks readiness and simulates, then stops.
- AUTONOMOUS may enter execution after explicit policy confirmation.

The execution orchestrator reloads policy and rolling context and recomputes the candidate; snapshot-embedded policy is not execution authority.

## Unsupported states and limitations

eMode, stable debt, isolation, and account/reserve reconciliation mismatches block portfolio execution estimation. MEI is minimum at token-unit resolution for the implemented single-action model; it does not claim global optimization involving swaps, multiple actions, gas, future price changes, interest accrual, or every Aave mode.

The legacy normalized single-debt/single-collateral engine remains covered for compatibility tests. Live Aave positions use portfolio-v2.

See [Aave integration](aave-integration.md), [safety](safety-model.md), and [testing](testing.md).
