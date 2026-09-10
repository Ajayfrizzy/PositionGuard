# Read-only Aave V3 integration

## Service and data flow

`getAavePosition({ walletAddress, chainId })` in src/lib/aave/service.ts accepts a validated EVM address and either configured Base chain: Base Sepolia 84532 or Base mainnet 8453. A server-created viem PublicClient selects the matching chain and RPC independently; no browser wallet or signer is involved. Tests can inject the narrow AaveReader interface; production always constructs the real RPC reader.

After network verification, all contract reads use one block number. The service obtains account totals from Pool.getUserAccountData and eMode from Pool.getUserEMode. It retrieves the reserve address list, reads user reserve balances and ERC-20 wallet balances, then fetches metadata, reserve configuration, price, pause status, debt ceiling and supply capacity only for relevant holdings. Six discovery workers and small HTTP batches bound concurrency. Scanning the list is necessary to find supplied assets disabled as collateral and wallet-only holdings, which a collateral/borrow bitmap would miss.

The returned domain object contains account summary, every relevant reserve, wallet protection balances, raw integer strings, a normalized portfolio input, blockers, block number/hash/timestamp and fetchedAt. A second read of that block's hash detects a reorg during the read. This is a coherent historical observation, not a guarantee that latest state has not subsequently changed.

## Units and precision

Aave USD totals and oracle prices retain 8 decimal base precision. HF is preserved as the raw 18-decimal WAD and a decimal string. uint256 maximum denotes unbounded HF only when debt is zero. Contradictory no-debt/HF results fail validation. Token balances retain their actual decimals and integer strings. Bigint is used throughout; only bounded decimals and basis points become JavaScript numbers.

Account HF is authoritative for current risk. Display values are not fed back into MEI. JSON serializes raw bigints as decimal integer strings. Snapshot HF is Decimal(78,18), USD fields Decimal(38,8), and the complete read/analysis context remains in JSON.

Sources for read signatures and semantics: [Pool](https://aave.com/docs/aave-v3/smart-contracts/pool), [Data Provider interface](https://github.com/aave-dao/aave-v3-origin/blob/main/src/contracts/interfaces/IPoolDataProvider.sol), [account calculation implementation](https://github.com/aave-dao/aave-v3-origin/blob/main/src/contracts/protocol/libraries/logic/GenericLogic.sol). The deployed market is checked via RPC; repository head alone is not proof of deployed implementation version.

## Portfolio model extension

Phase 1 inputs and all original tests remain supported. `evaluateProtection` additionally accepts the discriminated `model: "portfolio-v2"` shape from the Aave normalizer. The additional portfolio modules are protocol-independent integer-value calculations, not contract readers.

The portfolio retains every asset's identity, decimals, price, available balance, supplied balance, debt balance, eligible collateral threshold and supply capacity. The weighted collateral numerator is the sum of each enabled collateral's base value times its liquidation threshold in basis points. Do not reconstruct this numerator from the rounded account-average liquidation threshold.

Repayment reduces only the selected debt asset's contribution, keeping all other debt and collateral intact. Debt base-value rounding (up/down) is chosen only when summed reserve values reconcile with the account total. Additional collateral increases only that asset's weighted contribution, using its own threshold. Outcome calculations retain integer products until the necessary base-unit or final WAD division.

The minimum is found with a bounded binary search in actual token units, so a token amount immediately below the selected minimum cannot reach target under this model. Candidate comparison uses exact rational USD cost; six-decimal USD display amounts are conservatively rounded up and never drive ranking or policy checks. Results include tokenAmount and tokenAmountUnits alongside the backwards-compatible normalized USD amount.

Account totals and per-reserve values must reconcile. eMode, stable debt, isolation and mismatched totals block unsafe-position MEI rather than creating a fake single-asset position. No debt normally remains SAFE/NO_ACTION. Supply estimates are limited to already-enabled collateral reserves; pause/freeze/cap restrictions are checked. Wallet-only assets are represented but are not assumed to become enabled collateral merely by supply.

## Authenticated API

Set POSITIONGUARD_DEV_TOKEN to a random value of at least 32 characters. Requests require `Authorization: Bearer <token>`. Missing configuration fails closed. This authenticates a development operator permitted to inspect public wallets; it does **not** prove the wallet belongs to the operator, establish a user session or grant spending authority. Do not use this as production wallet authentication.

- `GET /api/positions/aave?address=0x...&chainId=84532`: live read and explicit default-policy preview; use 8453 for optional Base mainnet reads. No persistence.
- `POST /api/positions/aave`: JSON `{ address, chainId, policy }`; fresh live read, policy-validated preview, then one deliberate DECISION snapshot. Failure to save returns SNAPSHOT_PERSISTENCE_FAILED instead of a false saved confirmation.

The development policy is clearly displayed and can be changed for a saved analysis. Context explicitly assumes zero prior spend and no cooldown history; it is not an autonomous execution decision. The funding balance is the observed wallet's balance, not an authorized KeeperHub spending wallet. There is no polling or mount-time fetch on /dev/aave.

`previewPolicy` exists only for explicit development previews. `analyzePosition` requires its policy argument, and future execution preparation uses the server-only `prepareLiveProtectionAnalysis` path, which loads an enabled `ProtectionPolicy` for the exact wallet and chain before making the live Aave read. It fails closed when that policy is absent or disabled; snapshot-embedded analysis settings are not treated as active execution policy.

Wallet/address, chain, body and policy inputs are Zod-validated. Responses use no-store, omit internal error messages/stacks, and preserve structured error codes. Per-RPC timeouts, a bounded retry and a 45-second service deadline limit failing reads. Only server code reads BASE_SEPOLIA_RPC_URL or BASE_RPC_URL; the operator enters the development token into memory, with no localStorage or public environment variable.

## Snapshots and limitations

POST upserts an operator-observed User wallet record and creates one snapshot in a database transaction. The record must never be interpreted later as proof of wallet ownership. Additional snapshot purpose values support observation, pre-execution and post-execution reads in future phases. Explicit repeat POSTs intentionally produce new snapshots; GET never does.

There are no Aave/KeeperHub writes, approvals, AI, scheduler or production sessions. Estimates do not include future price changes, accrued debt after the observation block, token-transfer behavior, funding-wallet allowances, gas or exact implementation-specific Aave index rounding after a write. The weighted model may differ slightly from historical versions using a rounded average threshold. Exact simulation, state revalidation and receipt evidence are mandatory before future execution.

Tokens with failed metadata or prices fail the read rather than enabling partial analysis. Native ETH is not silently treated as WETH; only ERC-20 reserve balances are discovered. The source does not provide fresh-oracle-time guarantees merely because a price is nonzero. Phase 3 must verify oracle freshness/sequencer safety and funding/signing semantics.
