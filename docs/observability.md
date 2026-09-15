# Observability

PositionGuard records both system operation and user-visible protection state. The goal is to answer: Was the position evaluated? What decision was made? Was execution attempted? Did it succeed on Aave? Was the user notification delivered?

## Worker status

The worker writes a database heartbeat every 10 seconds. Docker health also uses a file heartbeat.

| UI state    | Meaning                                                                     |
| ----------- | --------------------------------------------------------------------------- |
| ONLINE      | Heartbeat is no older than 30 seconds.                                      |
| DEGRADED    | Heartbeat is over 30 seconds old but no older than 60 seconds.              |
| OFFLINE     | Heartbeat is over 60 seconds old.                                           |
| NOT_STARTED | No heartbeat exists for the configured chain, worker name, and environment. |

An enabled policy is shown active only when monitoring state supports it. WORKER_NAME and WORKER_ENVIRONMENT prevent one deployment namespace from masquerading as another.

## Structured logs

The worker emits one JSON object per line for lifecycle and cycle events. Autonomous events are:

- autonomous-evaluation
- autonomous-revalidation
- autonomous-skipped
- autonomous-simulation
- autonomous-broadcast
- autonomous-confirmed
- autonomous-failed

Metadata includes a shortened wallet, chain, decision/execution identifiers where available, action, asset, amount, canonical fingerprint, status, and reason. Startup, shutdown, heartbeat errors, cycle totals, and per-cycle failure counts are also structured.

Use:

```sh
sudo docker compose logs --tail=100 worker
sudo docker compose logs --follow worker
```

Avoid logging environment values or full credentials.

## Monitoring runs and audit trail

Each protected-account cycle creates a MonitoringRun with start, completion, status, snapshot/decision linkage, execution outcome, or sanitized error code.

Audit events cover position monitoring, threshold crossing, candidate evaluation, MEI selection, policy/mode updates, blocked protection, stale cancellation, monitoring failure, receipt verification, Aave event confirmation, and HF improvement. Execution rows preserve simulation/execution state, KeeperHub ID, transaction evidence, before/after HF, failure reason, and completion time.

The Activity page combines audit and execution events chronologically. Routine monitoring is intentionally omitted from the default important/all presentation, while warnings, execution evidence, and historical failures remain available. A later successful monitoring event can label an earlier monitoring failure as recovered without deleting the failure.

## Notifications

The notification center has two presentations:

- **Meaningful:** groups semantically unchanged MEI recalculations and related events for one execution.
- **All notifications:** shows every underlying persisted notification.

Available filters are Risk, Recommendations, Executions, Failures, Delivery, and System. The UI renders 25 items initially and adds 25 with Load 25 more. This is client-side presentation pagination; the current API fetches the wallet-scoped notification collection.

Unique dedupe keys prevent duplicate semantic delivery. Grouping never deletes underlying rows.

## Product failure versus delivery failure

A notification row is created before optional webhook delivery. Its delivery status is PENDING, DELIVERED, FAILED, or SKIPPED, with attempts and the last sanitized delivery error.

A webhook failure means the external endpoint did not accept the notification. It does **not** mean monitoring or execution failed, and it does not remove the in-app record. Conversely, an execution failure remains a product failure even if its notification webhook was delivered successfully.

The Delivery filter isolates PENDING/FAILED webhook states. The Failures filter is for product and monitoring failures; delivery incidents remain separately inspectable.

## Incident workflow

1. Check sudo docker compose ps and the public /api/health endpoint.
2. Compare the database heartbeat state with worker container health.
3. Inspect recent monitoring-cycle and autonomous JSON logs.
4. Review the affected MonitoringRun, decision/readiness, and execution status.
5. For UNCONFIRMED execution, preserve the idempotency key and poll/reconcile; do not create a new request.
6. For stale cancellation, compare prepared and refreshed canonical fingerprints/amounts.
7. For verification failure, inspect KeeperHub receipts, independent RPC receipt, Aave event, and post-state in order.
8. For webhook incidents, troubleshoot the endpoint/signature separately from product execution.

See [architecture](architecture.md), [safety](safety-model.md), and [VPS deployment](vps-deployment.md).
