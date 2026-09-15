# Base Sepolia technical demo runbook

Base Sepolia (chain ID 84532) is the hackathon network. Its assets have no real-world value. This runbook separates read-only verification, simulation, and live execution so routine setup cannot accidentally broadcast.

## Network and wallet roles

| Component                      | Address                                    |
| ------------------------------ | ------------------------------------------ |
| Aave V3 Pool                   | 0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27 |
| Pool Data Provider             | 0xBc9f5b7E248451CdD7cA54e717a2BFe1F32b566b |
| Addresses Provider             | 0xE4C23309117Aa30342BFaae6c95c6478e0A4Ad00 |
| Oracle                         | 0x943b0dE18d4abf4eF02A85912F8fc07684C141dF |
| Aave reserve USDC (6 decimals) | 0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f |
| WETH (18 decimals)             | 0x4200000000000000000000000000000000000006 |

The Aave test USDC is not Circle Base Sepolia USDC. Only the configured Aave reserve can repay that reserve's debt.

- **Protected account:** user-owned wallet containing the Aave collateral/debt.
- **Execution wallet:** KeeperHub organization sender holding the underlying intervention token and Pool allowance.

For repayment, the execution wallet calls repay(asset, amount, 2, protected account). For collateral addition, it calls supply(asset, amount, protected account, 0).

## Pre-demo checklist

- [ ] Live app and /api/health respond.
- [ ] Base Sepolia is selected and visibly labeled testnet.
- [ ] Protected wallet ownership session is active.
- [ ] A supported Aave position is detected.
- [ ] Policy is enabled and thresholds/limits are correct.
- [ ] Intended execution mode is correct; use Monitor Only for a no-execution demo.
- [ ] Web and worker containers are healthy.
- [ ] UI worker state is ONLINE and last check is fresh.
- [ ] PostgreSQL and Base Sepolia RPC are reachable.
- [ ] KeeperHub authentication, organization wallet, chain, and sender pin are configured.
- [ ] If simulating, the execution wallet has the exact token and sufficient bounded Pool allowance.
- [ ] The historical confirmed execution and BaseScan tab are available.

## READ-ONLY CHECKS

These do not broadcast:

```sh
npm run verify:env
npm run verify:rpc
npm run verify:aave
npm run verify:keeperhub
npm run verify:allowance -- USDC 0.212852
```

- verify:env validates configuration formats without printing secrets.
- verify:rpc validates chain ID, Aave contracts/provider links, oracle base unit, reserve membership, and allowlisted token metadata.
- verify:aave captures a live coherent position for AAVE_WALLET_ADDRESS; an address and chain may be passed explicitly.
- verify:keeperhub checks authenticated configuration and capabilities. It does not simulate or broadcast and is not execution proof.
- verify:allowance reads the configured execution wallet's token balance and Pool allowance for the stated amount. It creates no approval.

Database verification performs temporary CRUD rather than a pure read:

```sh
npm run db:validate
npm run verify:db
```

Use verify:db only when a harmless temporary database probe is acceptable.

## SIMULATION

The product's Ask Before Acting mode and the execution UI simulation route send the server-built canonical call to KeeperHub with simulate true, after sender, funding, and allowance checks. They do not broadcast.

The combined autonomous-operations verifier writes monitoring/snapshot/audit data and calls KeeperHub simulation, but explicitly reports broadcastAttempted: false:

```sh
npm run verify:autonomous
```

Before using it, confirm AAVE_WALLET_ADDRESS, active policy, database, funding, allowance, and KeeperHub configuration. This command is non-broadcasting but not side-effect-free because it persists a monitoring cycle.

A successful simulation must show the expected sender and Aave Pool, success true, wouldRevert false, and a gas estimate. Failure stops the lifecycle.

## LIVE EXECUTION — TRANSACTION-CAPABLE

> **DANGER: The operations in this section can broadcast an on-chain transaction. Do not run them during routine setup or documentation verification. Use only with explicit authorization, testnet assets, reviewed policy, and a deliberate execution plan.**

The long-running worker and a one-shot worker cycle can autonomously execute when a policy is enabled in Protect Automatically:

```sh
# TRANSACTION-CAPABLE when any enabled policy is AUTONOMOUS
npm run worker:monitor

# TRANSACTION-CAPABLE when an enabled policy is AUTONOMOUS
npm run worker:monitor -- --once
```

Before deliberate live execution:

1. Reconfirm Base Sepolia and test-only assets.
2. Review the protected account's live HF and policy.
3. Confirm execution mode AUTONOMOUS was explicitly enabled.
4. Confirm supported candidate, exact MEI amount, execution-wallet balance, and bounded Pool allowance.
5. Confirm KeeperHub sender/capability and successful simulation.
6. Confirm no existing submitted or unconfirmed execution needs reconciliation.
7. Observe worker logs through revalidation, broadcast, receipt, and Aave verification.
8. Stop and investigate any stale, blocked, unconfirmed, or failed outcome; do not manually resubmit with a new key.

The operator-only HTTP broadcast path is also transaction-capable and requires both operator authentication and the separate broadcast token. It should not be used as a normal demo action.

## Existing execution evidence

No new transaction is needed for the final demo. Use the persisted historical record:

| Field               | Value                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| Before HF           | 1.549918707188866008                                                                                           |
| Repayment           | 0.212852 USDC                                                                                                  |
| KeeperHub execution | r2glntpejp16jxatt6th8                                                                                          |
| Transaction         | [BaseScan](https://sepolia.basescan.org/tx/0xc140daf6aed1e8e0623eaadbaee7dee5a59ffe860c9bd576d606401d761d7ba1) |
| After HF            | 1.599999884615885683                                                                                           |

The final documentation audit independently confirmed the successful receipt at block 46623821 and exact Aave Pool Repay event for 212852 USDC base units. The product UI loads confirmed historical evidence from PostgreSQL rather than hardcoding it.

## Post-demo check

```sh
sudo docker compose ps
sudo docker compose logs --tail=100 worker
sudo docker compose logs --tail=100 web
curl -fsS https://positionguard.online/api/health
```

Confirm the expected mode remains selected, the worker is healthy, and no unintended execution was created. See [demo walkthrough](demo.md), [KeeperHub integration](keeperhub-integration.md), and [observability](observability.md).
