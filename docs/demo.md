# PositionGuard demo walkthrough

Use Base Sepolia and keep the TESTNET label visible. This walkthrough demonstrates the final product; it does not require a new transaction. The historical confirmed execution should come from PostgreSQL, never a hardcoded or seeded UI value.

## Before recording

1. Confirm [positionguard.online](https://positionguard.online) and /api/health respond.
2. Confirm the web and worker containers are healthy and the UI reports monitoring ONLINE.
3. Use the protected wallet associated with the existing persisted position and historical execution.
4. Confirm the policy is enabled in the intended mode.
5. Confirm Dashboard, Protection, Activity, Scenario, and Notifications load.
6. Open the [verified BaseScan transaction](https://sepolia.basescan.org/tx/0xc140daf6aed1e8e0623eaadbaee7dee5a59ffe860c9bd576d606401d761d7ba1) in a separate tab.
7. Do not trigger a new live execution during recording.

## Short 90-second version

| Time      | Screen                           | Presenter point                                                                                                                 | Evidence judges should notice                                                                              |
| --------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 0:00–0:12 | Landing/onboarding               | Aave borrowers must monitor HF and act before liquidation; signing proves wallet ownership without moving funds.                | Wallet connection and signed ownership flow, Base Sepolia context.                                         |
| 0:12–0:28 | Dashboard / Position             | PositionGuard reads the user's Aave V3 account and continuously monitors it outside the browser.                                | Protected wallet, live HF/collateral/debt, worker ONLINE, snapshot freshness.                              |
| 0:28–0:43 | Settings                         | The user controls target/warning/emergency HF, actions, capital, daily limit, approval threshold, cooldown, and execution mode. | Explicit Protect Automatically confirmation and policy status.                                             |
| 0:43–0:58 | Protection                       | The deterministic engine compares repay/supply candidates and selects the smallest policy-compliant target-reaching MEI.        | Candidate amounts, projected HF, rejection reasons, funding/allowance state.                               |
| 0:58–1:08 | Scenario                         | A collateral-price shock uses the same engine without changing live state.                                                      | SIMULATION ONLY, stressed HF, MEI, projected recovery, no transaction.                                     |
| 1:08–1:23 | Historical protection / BaseScan | KeeperHub executed the canonical repayment; PositionGuard independently verified it.                                            | 0.212852 USDC; HF 1.549918707188866008 → 1.599999884615885683; KeeperHub ID; successful Repay transaction. |
| 1:23–1:30 | Activity / Notifications         | Every decision, failure, delivery result, and verified outcome remains inspectable.                                             | Audit chronology, receipt/Aave verification, notification filters and delivery separation.                 |

Closing line: “PositionGuard does not merely warn or blindly repay: it computes the minimum permitted Aave intervention, executes the canonical action through KeeperHub, and verifies the protocol result.”

## Full 3-minute version

### 0:00–0:20 — Problem and ownership

**Show:** onboarding and Base Sepolia label.

**Explain:** Aave borrowers must watch health factor, prices, debt, capital, and timing. A stale or oversized automation can be worse than an alert. Wallet connection is followed by a signed ownership challenge; the message is not a transaction.

**Notice:** verified user-owned protected account and no request for arbitrary execution data.

### 0:20–0:45 — Live Aave position and worker

**Show:** Dashboard, then Position.

**Explain:** the server reads account and reserve data at one block and verifies the Aave deployment. The hosted worker operates independently of the browser.

**Notice:** wallet/network, HF, collateral/debt, reserve details, block/snapshot time, and monitoring ONLINE.

### 0:45–1:10 — Protection policy

**Show:** Settings.

**Explain:** target, warning, and emergency thresholds; repay/supply permissions; per-action and daily capital; approval threshold; cooldown; enabled state; and three execution modes.

**Notice:** Monitor Only observes, Ask Before Acting simulates and stops, and Protect Automatically requires explicit confirmation.

### 1:10–1:35 — MEI decision

**Show:** Protection.

**Explain:** PositionGuard evaluates reserve-specific repay and already-eligible collateral-supply effects. It finds the smallest token-unit amount expected to reach target, then applies policy.

**Notice:** current and projected HF, selected MEI, alternatives, capital estimates, policy rejections, execution-wallet funding and allowance. If the current position is safe, explicitly say “No action is required now; the confirmed execution shown later is historical.”

### 1:35–1:55 — Safe scenario test

**Show:** Scenario; choose a collateral asset and a 10–20% drop.

**Explain:** the same deterministic engine runs against a stressed copy of the latest snapshot.

**Notice:** SIMULATION ONLY, current/stressed HF, projected risk, MEI, projected recovery, capital, and the statement that no funds or on-chain state change.

### 1:55–2:30 — KeeperHub execution evidence

**Show:** historical confirmed protection panel and BaseScan.

**Explain:** PositionGuard built the Aave repayment, verified sender funds and allowance, simulated through KeeperHub, revalidated the canonical effect, broadcast with idempotency, polled the execution, then verified receipt, Aave event, and post-state.

**Notice:**

- before HF: 1.549918707188866008;
- MEI: repay 0.212852 USDC;
- KeeperHub ID: r2glntpejp16jxatt6th8;
- after HF: 1.599999884615885683; and
- the [successful Base Sepolia transaction](https://sepolia.basescan.org/tx/0xc140daf6aed1e8e0623eaadbaee7dee5a59ffe860c9bd576d606401d761d7ba1).

On BaseScan, point to the successful transaction and Aave Pool Repay event. Do not imply that a current safe HF is the historical pre-execution state.

### 2:30–2:50 — Reliability and audit

**Show:** Activity and Notifications.

**Explain:** stale interventions are cancelled, ambiguous executions remain unconfirmed, and only verified outcomes become confirmed. In-app notification persistence is independent of webhook delivery.

**Notice:** audit events, execution status, receipt and Aave-effect labels, Meaningful/All views, category filters, delivery status, and Load 25 more.

### 2:50–3:00 — Close

**Show:** Dashboard summary.

**Explain:** PositionGuard combines deep Aave state understanding, minimum-capital deterministic decisions, controlled KeeperHub execution, and independent outcome verification.

## Recording cautions

- Do not broadcast a new transaction solely for the video.
- Do not show .env, API responses containing credentials, database URLs, terminal history with secrets, or private infrastructure details.
- Do not claim AI decides or executes; it only explains deterministic results.
- Do not call verify:keeperhub execution proof; it is configuration/readiness verification.
- Do not call a webhook failure an execution failure.
