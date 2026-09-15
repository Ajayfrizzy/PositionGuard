# Testing and verification

PositionGuard tests deterministic financial behavior separately from network adapters, orchestration, persistence-facing mapping, and UI presentation. Unit fixtures are not claimed as live-chain evidence.

## Test layers

| Layer                | Coverage                                                                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deterministic engine | Risk thresholds, candidate generation, token-unit minimality, projected outcomes, exact ordering, no-action and no-safe-action states.                                        |
| Policy               | Threshold validation, action permissions, per-action/daily limits, approval threshold, cooldown, disabled policy, execution modes.                                            |
| Aave                 | Account/reserve normalization, decimals/prices, collateral flags, reconciliation, unsupported eMode/stable debt/isolation, coherent block context.                            |
| Canonical intents    | Repay/supply allowlists, units, stable serialization/fingerprint, rejected tampering and arbitrary fields.                                                                    |
| KeeperHub adapter    | External schemas, sender/capabilities, simulation/broadcast/status contracts, receipts and failure cases.                                                                     |
| Authorization        | Wallet challenge/session helpers, origin rules, mode-only requests, operator and effect-bound broadcast authorization.                                                        |
| Execution            | Funding/allowance gates, simulation, stale cancellation, unique idempotency, duplicate claims, unconfirmed/failure/confirmed outcomes, receipt/event/post-state verification. |
| Monitoring           | Per-mode behavior, autonomous path, account isolation, failure persistence, worker heartbeat/status presentation.                                                             |
| Notifications        | Risk/action transitions, dedupe, delivery separation, grouping, filters, load-more presentation, failure visibility.                                                          |
| Product UI mapping   | Current-versus-historical execution, timelines, explorer safety, status labels, scenario presentation, loading/error states.                                                  |
| AI explanation       | Schema validation, candidate-reference boundary, timeout/failure fallback, advisory-only content.                                                                             |

Tests live under [tests](../tests), with unit and integration suites. The integration Aave test uses injected reader fixtures; run the verification scripts for actual configured network checks.

## Local quality commands

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run db:validate
npm run db:generate
npm run build
git diff --check
```

The project requires Node 24 or 25; .nvmrc selects Node 24.

## Environment-dependent checks

No command in this table broadcasts a transaction.

| Command                                   | Scope and side effects                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| npm run verify:env                        | Validates required formats; sanitized output.                                                    |
| npm run verify:rpc                        | Read-only live RPC, Aave deployment, provider, oracle, reserve, and token checks.                |
| npm run verify:aave                       | Read-only coherent Aave position capture.                                                        |
| npm run verify:keeperhub                  | Read-only KeeperHub auth/catalog/wallet/capability check; no simulation or broadcast.            |
| npm run verify:allowance -- USDC 0.212852 | Read-only balance and Pool allowance check.                                                      |
| npm run verify:db                         | Temporary database create/read/delete probe.                                                     |
| npm run verify:autonomous                 | Persists a monitoring cycle and performs KeeperHub simulation; reports broadcastAttempted false. |

Do not use npm run worker:monitor -- --once as a routine test when an enabled policy is AUTONOMOUS. That is a real monitoring cycle and may broadcast.

## Interpreting results

- A mocked test proves deterministic behavior at a boundary, not live provider availability.
- verify:keeperhub proves configuration/readiness, not actual execution routing.
- A successful simulation proves the tested call did not revert in simulation, not that it was mined.
- A submitted transaction is not confirmed protection.
- Confirmed protection requires KeeperHub receipt, independent RPC/Aave event, and post-state verification.
- Database-dependent failures may indicate networking/configuration rather than a code regression; preserve the exact sanitized error.

Do not hardcode a test count in this document. The completion report should quote the count produced by the final npm test run.
