# Deterministic protection engine

Phase 1 evaluates normalized inputs with no network, database, AI or execution side effects. Call `evaluateProtection(position, policy, context)` from `src/lib/protection/protection-engine.ts`. The entry point validates all three inputs with strict Zod schemas and throws a ZodError for invalid data. All candidates are returned for later persistence; this phase does not write decisions to PostgreSQL.

## Financial contract

Financial values are nonnegative decimal **strings** with up to 24 integer and 6 fractional digits. Numbers, exponents, signs, nonfinite values and excess precision are rejected. Internally, arithmetic uses bigint at micro-USD resolution, without floating-point rounding. Candidate `amount` and `estimatedUsdValue` both denote USD in this phase, not token quantities. Asset identifiers are descriptive symbols, not an execution allowlist.

The position supplies `healthFactor`, `totalCollateralUsd`, `totalDebtUsd`, `liquidationThreshold`, `availableDebtAssetBalanceUsd`, `availableCollateralAssetBalanceUsd`, `debtAsset` and `collateralAsset`. The threshold must be in (0, 1]. HF must equal collateral × threshold / debt, floored to six decimals. Zero debt requires `healthFactor: null`, representing unbounded HF; a contradictory supplied HF is rejected.

Repay leaves collateral constant and decreases debt. Add-collateral leaves debt constant and increases collateral under the same normalized threshold. Zero/negative intervention amounts and repayments above debt are invalid. Outcome estimation models the financial effect independently of funding; the policy layer rejects insufficient balances.

## Risk and policy

Thresholds must satisfy target > warning > emergency > 1.

| HF | Risk |
| --- | --- |
| At or above target, or no debt | SAFE |
| Warning inclusive to target exclusive | WATCH |
| Emergency inclusive to warning exclusive | HIGH |
| Below emergency | CRITICAL |

SAFE returns NO_ACTION with no candidates. Per the updated Phase 1 brief, all positions below target, including WATCH, are evaluated. This supersedes the original plan's monitor-only WATCH behavior.

Policy disabled, action disabled, insufficient funding, amounts above maxAutonomousAmountUsd, daily overspend and active cooldown reject a candidate. The autonomous cap is a hard cap in Phase 1; exceeding approvalRequiredAboveUsd within the other limits marks REQUIRE_APPROVAL. Equality at monetary limits is allowed. There is no emergency cooldown bypass. `dailyAutonomousSpendUsd` must include pending reservations when a future caller implements execution. The supplied `nowMs` and last execution timestamp make time-based checks reproducible; future timestamps fail validation. Context is required, never silently defaulted to zero spend.

## Minimum Effective Intervention

With C collateral, D debt, L liquidation threshold and T target:

- Minimum repayment = max(0, D - C × L / T).
- Minimum additional collateral = max(0, (T × D - C × L) / L).

Compute the minimum using exact integer products and ceiling division to one micro-USD. Generate up to eight unique positive amounts for each action: half-minimum, predecessor, exact minimum, successor, 125% of minimum, balance, autonomous cap and approval threshold. Impossible repayments above debt are omitted. Candidates above balances or policy limits remain visible with rejection reasons. The bounded array has at most 16 entries.

For each candidate retain target attainment, policy validity, combined validity, approval requirement, rejection reason and rank. Rank by target attainment, policy compliance, capital, approval requirement, then complexity (repay before supply for ties). Select the smallest valid autonomous candidate; if none exists, attach the best valid approval candidate to REQUIRE_APPROVAL. If nothing restores target, return status NO_SAFE_ACTION and action NO_ACTION, never a sub-target intervention. Ranked arrays and inputs are not mutated.

Example: collateral $1,500, debt $1,000, L=0.8 and target 1.5 gives HF 1.2. Repay $200 restores 1.5; repay $199.999999 falls short. Adding collateral needs $375, so repayment wins if permitted and funded.

## Limits of this model

One debt asset and one added collateral asset, with the added collateral assumed to have the current weighted liquidation threshold. There are no live oracle prices, token conversions, reserve caps, eMode/isolation handling, accrual, price movement, gas costs or Aave rounding guarantees. The minimum is at micro-USD resolution, not onchain token-unit resolution. A future Aave adapter must refine this model before any real execution. No result authorizes a transaction.

## Phase 2 extension

The legacy contract above remains supported. Real Aave reads use the generic portfolio-v2 branch, preserving full HF precision, token amounts, all relevant assets and per-asset collateral thresholds. See [Aave integration](aave-integration.md) for the model and its read-only limits.
