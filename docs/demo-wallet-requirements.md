# Real demo wallet requirements

## Required configuration

- BASE_SEPOLIA_RPC_URL: Base Sepolia JSON-RPC endpoint for the default testnet demo. BASE_RPC_URL is the separate optional Base mainnet endpoint. Both remain server-only.
- DATABASE_URL: reachable PostgreSQL URL with TLS settings/CA required by the provider, plus permissions for the two Prisma migrations and application queries. Use a migration-capable direct or session-pool connection if a provider's transaction pool restricts migrations.
- POSITIONGUARD_DEV_TOKEN: random secret of at least 32 characters for the development API. Generate locally with `openssl rand -hex 32` and store in .env; never in NEXT_PUBLIC or chat.
- AAVE_WALLET_ADDRESS: the protected public address, or pass the address to verify:aave.
- KEEPERHUB_API_KEY: an organization kh_ key. Read scope is sufficient now; Phase 3 broadcast needs mcp:write/admin and the organization's spending configuration.
- KEEPERHUB_BASE_URL: optional, defaults to the official HTTPS app origin.
- KEEPERHUB_EXECUTION_WALLET: optional expected sender pin, populated only after checking organization-wallet output and the intended EOA route.

## Protected wallet B

B needs an actual Base Aave V3 variable-rate debt in an allowlisted asset, permission to be protected, and a position within supported estimator modes. A no-debt wallet is useful for read verification but cannot demonstrate intervention. For a collateral-supply demonstration, B must already use the selected reserve as collateral. Standard-mode USDC debt and eligible WETH collateral are the simplest supported examples; verify current reserve configuration rather than assuming eligibility.

Do not create or manipulate a risky position in Phase 2.5. The supplied wallet was live-read successfully but has no collateral or debt; a debt-bearing demo position is still required.

## KeeperHub wallet K

K must be the verified organization sender on Base, explicitly bound to B. It must hold the borrowed **underlying** token for repayment (for example native Base USDC), or the collateral underlying token for supply (for example ERC-20 WETH). ETH and WETH are not interchangeable; there is no automatic wrapping or swap in PositionGuard.

K must give the configured Pool sufficient allowance for the selected asset/amount. Existing allowance can be read with:

```sh
npm run verify:allowance -- USDC 5
npm run verify:allowance -- WETH 0.001
```

Those quantities are read-only examples, not approvals or confirmed required demo amounts. Phase 3 will separately simulate and authorize any missing bounded approvals through KeeperHub. Fund native ETH only according to the actual execution/gas route and its current estimate; do not assume all calls are sponsored because a connectivity example is sponsored.

## Small demonstration budget: illustrative arithmetic

Actual requirements must come from the live position and current oracle. For illustration only, suppose debt is $30, current HF is 1.30, target HF is 1.50, prices stay fixed, and eligible added collateral has LT 0.80:

| Intervention | Estimated capital |
| --- | --- |
| Repayment | 30 × (1 - 1.30 / 1.50) = $4 |
| Add collateral | (30 × 1.50 - 30 × 1.30) / 0.80 = $7.50 |

A roughly 10-USDC funding balance would leave a buffer for this specific $4 repayment example **if the oracle values USDC at $1**. A $10–$15 collateral-value budget could cover the illustrative supply requirement; the WETH quantity must be calculated from the actual oracle price. These are planning examples, not minimum-deposit rules, present prices, gas quotes or guarantees. Interest, rounding, reserve caps, existing balances and policy limits can change the required amount. Set a small explicit policy budget before any Phase 3 execution.

Gas funding and transaction sponsorship need independent verification. Keep the intended actions, required token units, current K balances, Pool allowance and live fee estimate in the final demo checklist; do not send funds based only on this table.

## Go/no-go evidence before Phase 3 broadcast

1. verify:rpc passes on the configured endpoint.
2. db:migrate:safe and verify:db pass against the real database.
3. verify:aave completes for B and confirms a supported debt-bearing position.
4. verify:keeperhub authenticates and confirms Base and the expected organization wallet; EOA routing is separately verified.
5. K balances/allowances cover the exact server-built, policy-approved action.
6. Ownership/consent, policy persistence, concurrency/budget guards, simulation, stale-state checks, stable idempotency and receipt/effect verification are implemented and tested.

No funds, approvals or transactions were moved in this phase. A future zero-value self-transfer also needs explicit broadcast authorization.
