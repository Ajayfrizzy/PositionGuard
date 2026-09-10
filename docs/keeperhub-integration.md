# KeeperHub integration contract

The read client remains GET-only. A separate server-only direct-execution adapter implements strict simulation, broadcast, status polling, and verified-receipt parsing. The reusable orchestrator owns the safety sequence and the UI can request only `simulate` or `broadcast` for the configured protected wallet. No approval, zero-value transfer, or value-moving broadcast was performed during final hardening.

## Authentication and diagnostics

Application environment names are KEEPERHUB_API_KEY and optional KEEPERHUB_BASE_URL (default https://app.keeperhub.com). These are our configuration names; KeeperHub receives `Authorization: Bearer <kh_organization_key>`. User webhook keys (wfb_) are not suitable. The current client accepts only the official HTTPS origin and rejects redirects to avoid sending credentials to another host.

`npm run verify:keeperhub`:

1. Requests GET /api/keys before interpreting connectivity as authentication.
2. Reads up to ten pages to find an unambiguous matching key prefix and its disclosed scope. Missing/ambiguous scope stays unknown; prefixes or secrets are not printed.
3. Checks the public GET /api/chains catalog for the configured chain, requiring enabled EVM Base Sepolia 84532 with testnet metadata or enabled EVM Base mainnet 8453 without it. Public catalog success alone cannot validate a key.
4. Reads GET /api/user/wallet and GET /api/user, validates the active organization wallet, and compares addresses.
5. Checks an optional KEEPERHUB_EXECUTION_WALLET pin and reports the organization ID, wallet and scope capabilities only.

Only selected fields are returned; names, email addresses, full key responses and credentials are not logged. Non-2xx, timeout, invalid JSON and invalid schemas fail verification. Documented scopes are mcp:read for reads/simulation, mcp:write or mcp:admin for broadcast. An explicitly unscoped legacy key is unrestricted according to KeeperHub; an absent scope field is unknown, not assumed unrestricted.

Sources: [Authentication](https://docs.keeperhub.com/api/authentication), [API keys and pagination](https://docs.keeperhub.com/api/api-keys), [User/organization wallet reads](https://docs.keeperhub.com/api/user).

## Prepared transaction paths

`buildAaveRepayIntent` and `buildAaveSupplyIntent` accept only chainId, assetSymbol, exact decimal token amount, beneficiary and sender. USDC and WETH are allowlisted separately for each configured chain; Base Sepolia uses Aave's test USDC reserve, not another USDC deployment. Addresses/decimals come from the Aave address book and must also pass runtime verification. No frontend target, ABI, function name, calldata, native value or gas override is accepted.

The output contains a canonical body for future POST /api/execute/contract-call:

- chainId: numeric string
- contractAddress: configured Aave Pool
- functionName: repay or supply
- functionArgs: JSON array string, preserving integers as decimal strings
- abi: server-defined JSON ABI string
- value: "0" in native ether units

It also includes locally encoded calldata, token base-unit amount and expectedSender. Equivalent input decimal spellings produce the same serialized request. Serialization regenerates the trusted intent and rejects tampering. The fingerprint binds the expected sender and beneficiary as well as the transaction effect. A fingerprint alone is not a persisted decision idempotency key or authorization.

## Controlled execution lifecycle

The orchestrator implements this lifecycle:

1. Load the enabled persisted policy for the exact protected wallet and chain with `prepareLiveProtectionAnalysis`. Missing or disabled policies stop preparation; preview defaults and snapshot-embedded analysis settings are never execution authority. Then perform the policy-approved decision and actual K funding/allowance checks.
2. Persist the canonical body and a key derived from decision plus effect.
3. Send the same body with strict boolean simulate=true; require success=true and wouldRevert=false, plus the expected sender/target.
4. Refresh B's position, K's balances/allowance, policy, cooldown and reserved daily budget immediately before submission. Stale decisions cancel/recompute.
5. Remove only simulate and submit with the persisted Idempotency-Key.
6. Persist executionId and poll GET /api/execute/{executionId}/status, honoring X-Poll-Interval-Hint and Retry-After.
7. Require nonempty receipt evidence: receipts[].verified=true and receiptStatus=success on the expected chain, then independently verify the actual transaction effect and Aave outcome. A completed status or hash alone is insufficient.

The replay window is 24 hours. Timeouts never justify a new key. Keep the exact canonical values; re-serializing "1" as "1.0" or changing field aliases can create a conflict. Handle idempotency_in_progress by retrying the same work/key; reconcile a conflict using originalExecutionId where provided. Ambiguous outcomes past the replay window must not auto-resubmit. Unconfirmed outcomes are poll/reconcile-only. These details come from [Direct Execution](https://docs.keeperhub.com/api/direct-execution) and [execution recovery](https://docs.keeperhub.com/cli/execution-recovery).

## Optional zero-value preflight

`buildZeroValueSelfTransfer({ chainId, sender })` only prepares `/api/execute/transfer` with amount "0" and recipient equal to sender. It rejects caller-provided alternate amounts or recipients and marks explicit broadcast authorization required. There is no function that submits it.

KeeperHub's [first verified transaction guide](https://docs.keeperhub.com/guides/first-verified-transaction) describes a zero-value self-transfer with sponsored gas. Treat this as a future optional mined connectivity check after confirming the actual wallet/gas route. It is still an onchain transaction; it is not automatically permitted by this read-only phase and would not establish Aave allowance or validate repayment semantics.
