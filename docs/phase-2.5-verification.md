# Phase 2.5 verification record

Checked on 2026-09-08. Configuration changed during verification; the results below describe the latest attempts, not earlier missing-variable checks. Secrets and connection URLs are omitted.

| Check                                | Actual result                                                                                                                                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configured Base RPC                  | Passed at block 51046417, chain 8453, timestamp 2026-09-08T15:43:04.480Z                                                                                                                                       |
| Aave contracts                       | Pool, Data Provider, provider links and USD base unit verified by verify:rpc                                                                                                                                   |
| ERC-20 reads                         | Native USDC decimals 6 and WETH decimals 18 verified, with reserve membership and token reads                                                                                                                  |
| PostgreSQL migration                 | Attempted; failed. No successful migration application claimed                                                                                                                                                 |
| PostgreSQL connectivity              | pg returned ENOTFOUND outside the sandbox. DNS inspection found no IPv4 record (ENODATA), one IPv6 record; direct IPv6 TCP probe returned EHOSTUNREACH                                                         |
| Tables and server create/read/delete | verify:db attempted and failed to connect; table existence and CRUD remain unverified                                                                                                                          |
| Complete live Aave position          | Passed at block 51046419: wallet 0x1cb9Fa3A90b826203408B9eA65be56Ac7e87ef46; collateral/debt/available borrow all zero, HF null, no supplied or borrowed reserves, no protection balances or analysis blockers |
| KeeperHub authenticated reads        | Passed. Organization wallet/profile agree on 0xa7462E9F08C56053c87F3E2a35Af8DBeA4786531. Unique matching key discloses mcp:read mcp:write mcp:admin; simulation and broadcast capabilities available           |
| Base KeeperHub catalog               | Passed during authenticated verification: Base 8453 enabled, EVM, not testnet                                                                                                                                  |
| Transactions                         | None submitted, including approvals and zero-value self-transfers                                                                                                                                              |

## Configuration requiring correction

All five required environment values passed format checks. RPC, Aave wallet and KeeperHub authentication also passed live checks. DATABASE_URL points to an IPv6-only endpoint that this environment cannot reach. Use an IPv4-accessible PostgreSQL URL (for example the provider’s session pooler) or an IPv6-capable runtime; credentials have not been tested successfully. No environment values were changed by this verification.

KEEPERHUB_BASE_URL is optional and defaults to the official app origin. KEEPERHUB_EXECUTION_WALLET is an optional expected-sender pin and is required for the standalone allowance command. Set it from verified organization configuration, not from an assumed browser wallet.

## Implementation and quality

Added trusted repay/supply intent builders, exact token-unit conversion, stable serialization, read-only allowance and KeeperHub clients, future zero-value intent preparation, and sanitized verification commands. Original Phase 2 position reading remains the source for verify:aave. Invalid URL validation now returns INVALID_FORMAT without throwing or exposing the input.

The preceding implementation quality run passed (not repeated for this verification-only rerun): lint, strict typecheck, all 137 tests (including the original 94), Prisma schema validation, Prisma client generation, and the production build. Prisma client generation was rerun successfully. Unit fixtures are not live-chain evidence.

## Remaining Phase 3 gates

Correct database connectivity, apply both migrations and pass the server CRUD probe. The valid protected wallet has no position; a supported debt-bearing wallet is needed for intervention. Organization wallet and key scopes are verified, but the actual EOA/Safe execution route remains unverified and no expected-sender pin was configured. Then establish K's underlying-token funding and Pool allowance, policy binding, account-specific simulation, stable idempotency and receipt/effect verification before any separately authorized broadcast.

See [execution wallet model](execution-wallet-model.md), [KeeperHub integration](keeperhub-integration.md), and [demo asset requirements](demo-wallet-requirements.md).
