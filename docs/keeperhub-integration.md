# KeeperHub integration

PositionGuard uses KeeperHub as the controlled execution route for canonical Aave V3 interventions. A GET-only diagnostics client and a separate server-only direct-execution client keep readiness checks distinct from simulation and broadcast.

## Authentication and execution wallet

KEEPERHUB_API_KEY is a server-only organization key sent as a Bearer credential. KEEPERHUB_BASE_URL defaults to the official HTTPS application origin; the client rejects other origins and redirects.

The verification client proves authenticated access, matches the configured key prefix without logging it, validates disclosed capabilities when unambiguous, validates the Base chain catalog entry, compares the organization wallet/profile responses, and enforces the optional KEEPERHUB_EXECUTION_WALLET pin.

Wallet/profile responses alone do not prove the eventual EOA or smart-account route. The exact sender is also checked in simulation; direct Pool calls are checked against transaction identity or their exact Aave event.

## Canonical Aave intent

The server loads the active wallet/chain policy, reads live Aave state, loads rolling spend/cooldown context, recomputes candidates, and chooses an eligible candidate. The intent builder accepts only the configured chain, an allowlisted symbol (USDC or WETH), deterministic token amount, protected beneficiary, and configured sender.

It supplies the Aave Pool target, ABI, function, arguments, zero native value, and calldata. Repay uses variable-rate mode 2 and the protected account as onBehalfOf; supply uses the protected account as beneficiary and referral code 0.

The API body cannot supply target, calldata, ABI, function, token, amount, sender, or recipient. Canonical rebuilding detects tampering. The effect fingerprint binds action, sender, beneficiary, asset, amount, and wire body.

## Controlled execution lifecycle

```text
live policy + Aave read + MEI
  → sender and capability check
  → execution-wallet balance check
  → exact Pool allowance check
  → KeeperHub simulation
  → immediate canonical revalidation
  → unique database reservation and claim
  → KeeperHub direct broadcast
  → status polling
  → KeeperHub receipt validation
  → independent RPC, Aave event, and post-state verification
```

Simulation calls KeeperHub's direct contract-call endpoint with simulate true. PositionGuard requires success, a non-reverting result, the expected sender and Pool target, and a valid gas estimate.

Before broadcast, PositionGuard reconstructs the canonical preparation. A changed policy version, effect fingerprint, candidate amount, or no-longer-needed intervention produces POSITION_CHANGED and a persisted stale-cancellation event.

The database idempotency key binds wallet, chain, policy ID/version, action, asset, base-unit amount, and effect fingerprint. A unique constraint plus the conditional NOT_STARTED → SUBMITTED update prevents concurrent duplicate claims.

Broadcast removes only the simulation flag, supplies the persisted idempotency key, requires HTTP 202, stores the execution ID, and polls the status endpoint. Poll hints are capped at 30 seconds. The orchestrator waits up to 45 seconds in the current request; ambiguous/non-terminal outcomes become UNCONFIRMED and are not reported as success.

## Authorization paths

- A wallet session may request simulation only.
- The interactive/operator broadcast route requires the operator bearer credential and a separate POSITIONGUARD_BROADCAST_TOKEN. The derived authorization is effect-bound and expires after 60 seconds.
- The monitoring worker has a server-only autonomous entry point. It verifies that the persisted policy is enabled in AUTONOMOUS mode and passes every other orchestrator gate.

The product exposes no generic execution API and does not silently create token approvals. The execution-wallet-to-Pool allowance must already cover the exact action.

## Receipt, Aave effect, and post-state

A KeeperHub completed status or hash is insufficient. PositionGuard requires receipt evidence on the expected chain where every receipt is verified and successful, with one consistent hash.

It then fetches the transaction and receipt through the configured Base RPC. The receipt must succeed at the reported block. The Aave Pool must emit the expected event with the configured reserve, amount, and protected beneficiary; repay also requires the expected repayer. Finally, PositionGuard captures a new coherent Aave snapshot and requires HF improvement when both HFs are finite.

Only after these checks does the execution become CONFIRMED with receiptVerified true. Exact equality with the projected target is not required because accrual and on-chain rounding may differ.

## Readiness verification

These commands do not broadcast:

```sh
npm run verify:env
npm run verify:keeperhub
npm run verify:allowance -- USDC 0.212852
```

verify:keeperhub proves authenticated configuration, catalog support, organization wallet consistency, sender pin, and disclosed capability. It does **not** call simulation or broadcast and is not routing proof.

verify:allowance is a read-only balance/allowance comparison. verify:autonomous runs live reads, persistence, readiness, stress analysis, and KeeperHub simulation; its output says broadcastAttempted: false.

## Actual execution evidence

| Field                  | Value                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| Network                | Base Sepolia (84532)                                                                                           |
| Before HF              | 1.549918707188866008                                                                                           |
| Intervention           | Repay 0.212852 USDC                                                                                            |
| KeeperHub execution ID | r2glntpejp16jxatt6th8                                                                                          |
| Transaction            | [BaseScan](https://sepolia.basescan.org/tx/0xc140daf6aed1e8e0623eaadbaee7dee5a59ffe860c9bd576d606401d761d7ba1) |
| After HF               | 1.599999884615885683                                                                                           |

A read-only RPC check during the final documentation audit independently confirmed a successful receipt at block 46623821 and the Pool's exact Repay event: configured Aave USDC reserve, 212852 base units, protected account as user, and configured KeeperHub execution wallet as repayer. The KeeperHub ID and HFs are persisted repository evidence; the audit machine could not reach production PostgreSQL to re-query them.

The product loads evidence through [the confirmed-execution database selector](../src/lib/product/latest-verified-protection.ts); success values are not embedded in UI components.

## Failure and recovery semantics

- Failed readiness or simulation stops before broadcast.
- A stale canonical effect is cancelled and audited.
- Duplicate work returns DUPLICATE_PREVENTED.
- A timeout or ambiguous submission is persisted as UNCONFIRMED.
- A terminal KeeperHub failure, invalid receipt, mismatched Aave event, or non-improving post-state becomes failed.
- Status polling supports in-request recovery; there is no separate background reconciler for previously unconfirmed executions.

See [architecture](architecture.md), [safety](safety-model.md), and [Base Sepolia runbook](base-sepolia-demo.md).
