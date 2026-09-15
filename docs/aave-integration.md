# Aave V3 integration

## Supported networks and contracts

PositionGuard is configured for Base Sepolia (84532, default hackathon network) and Base mainnet (8453). Contract addresses are centralized in [chain configuration](../src/lib/chains/config.ts) and verified at runtime. No mainnet execution is claimed.

The reader validates RPC chain ID, deployed code, Addresses Provider links to Pool/oracle/Data Provider, Data Provider ownership, and the oracle USD base currency/unit before using state.

## Coherent position read

getAavePosition accepts a validated wallet and supported chain. The server creates the viem client from a server-only RPC variable. It captures a block, pins every account/reserve/token/oracle read to that block, and checks the block hash again to detect a reorganization during the read.

The service reads account collateral, debt, available borrow, HF, LTV, liquidation threshold, and eMode. It discovers reserves from the verified Pool and reads relevant user balances, wallet balances, variable/stable debt, collateral state, metadata, configuration, price, pause/freeze/active state, debt ceiling, supply cap, and aToken supply. Bounded concurrency and request deadlines limit failed RPC work.

The normalized result retains raw integer values, block number/hash/timestamp, decimal display values, reserve-specific liquidation thresholds, and analysis blockers.

## Precision and MEI input

Aave account HF remains an 18-decimal WAD; oracle/account base values retain their base-unit precision; token balances retain native decimals. Bigint drives normalization and decisions. Display numbers are not fed into execution.

Reserve collateral/debt contributions must reconcile with account totals. Unsupported eMode, stable debt, isolation, or reconciliation adds an analysis blocker, preventing an unsafe MEI. Supply candidates require the reserve to be already collateral-enabled, active, unpaused, unfrozen, non-isolated, and within capacity.

The portfolio engine models:

- variable-debt repayment for the selected reserve; and
- additional supply using that reserve's liquidation threshold.

A bounded binary search finds a minimum target-reaching token-unit amount. This is a single-action current-state model, not a prediction of price movement, accrual, gas, swaps, or multi-step strategies.

## Execution effects

Canonical actions are narrower than readable reserves. Current allowlists support USDC and WETH per configured Base network. The server builds Aave Pool repay(asset, amount, 2, protectedAccount) or supply(asset, amount, protectedAccount, 0).

The execution wallet supplies tokens and allowance; the protected account owns the Aave position. PositionGuard checks the execution wallet's underlying balance and Pool allowance independently.

After KeeperHub execution, PositionGuard validates the receipt and exact Pool Repay/Supply event, then captures a coherent post-execution position and requires finite HF improvement.

## APIs and authorization

Wallet onboarding signs and verifies ownership, creates a database-backed cookie session, and detects the Aave position. Product routes derive wallet/chain scope from that session.

The development Aave route remains an operator-only engineering verifier. The operator token is not user ownership proof and is not the only product authorization mechanism.

See [architecture](architecture.md), [protection engine](protection-engine.md), and [safety](safety-model.md).
