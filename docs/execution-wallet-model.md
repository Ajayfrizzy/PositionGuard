# Execution wallet model

## Chosen Phase 3 design

Use two explicitly bound addresses on Base mainnet:

- **B, protected beneficiary:** owns the Aave collateral/aTokens and owes the Aave debt. Its ownership/session and consent still require implementation and verification before execution.
- **K, funding/execution wallet:** KeeperHub's configured organization wallet, controlled by the organization under its KeeperHub authorization. K holds the underlying USDC/WETH used for protection. KeeperHub signs using the configured route, not the connected browser wallet.

B and K can be the same address, but that is not assumed. Phase 3 must bind organization, chain, K and B explicitly. The planned MVP route is an EOA. Authenticated wallet/profile reads now identify organization wallet 0xa7462E9F08C56053c87F3E2a35Af8DBeA4786531. The key discloses mcp:read, mcp:write and mcp:admin. Actual EOA/Safe broadcast routing remains unverified; see the Phase 2.5 verification record. An environment pin is a comparison constraint, not proof of signer ownership or route.

[KeeperHub User API](https://docs.keeperhub.com/api/user) describes GET /api/user.walletAddress and GET /api/user/wallet as organization-wallet reads. verify:keeperhub compares those two reported addresses and optionally checks KEEPERHUB_EXECUTION_WALLET. It deliberately reports senderRouteVerified=false: those responses alone do not establish broadcast routing.

## Repay

The server builder targets Base's verified Aave Pool:

`repay(underlyingAsset, amountInTokenBaseUnits, 2, B)`

For a USDC debt, underlyingAsset is native Base USDC, not USDbC, an aToken or the variable-debt token. The rate mode is 2 (variable). K must hold the underlying tokens and approve the Pool to spend at least the finite amount. Aave reduces B's debt using K's funds. This path does not require borrowing credit delegation; it is repayment on behalf of a borrower. The amount must be validated against the relevant reserve's debt and the policy, not merely total account debt.

The builder rejects zero amounts, excess decimal precision, unsupported assets/chains, zero wallets and uint256-max sentinel amounts. The finite amount avoids special repay-all semantics on behalf of another wallet. [Aave Pool contract API](https://aave.com/docs/aave-v3/smart-contracts/pool).

## Supply / add collateral

The server builder constructs:

`supply(underlyingAsset, amountInTokenBaseUnits, B, 0)`

K supplies its funds and grants the Pool allowance. The resulting aTokens belong to B because B is explicitly onBehalfOf; they do not belong to K. Funding another beneficiary is not a reversible custody deposit for the sender.

Supplying is not by itself proof of increased effective collateral. For the MVP, B must already have the selected reserve enabled as eligible collateral. Phase 3 must recheck user collateral status, reserve availability/caps, oracle conditions and supported account modes. Only then does an increase in B's supply support the predicted HF increase. The existing read-only estimator conservatively excludes supply candidates into reserves not already enabled by B.

## KeeperHub compatibility

KeeperHub's direct contract-call endpoint accepts the canonical Pool address, function name, JSON-serialized ABI and argument array. The builders produce those fields, native value "0", locally encoded calldata for later effect verification and expectedSender metadata. expectedSender is **not** a KeeperHub wallet override. No endpoint is called by a builder.

The ABI/wire formats are compatible on paper. A successful simulation of the funded and approved account-specific intent has not been demonstrated. [Direct execution specification](https://docs.keeperhub.com/api/direct-execution) documents a Safe limitation: simulation uses the organization EOA even when writes route through a Safe. A Safe route must remain blocked for this MVP until equivalent execution-path simulation and sender semantics are verified.

## Allowance and funding ownership

`getAaveAllowance` reads `underlying.allowance(K, Pool)`, never `allowance(B, Pool)` merely because B connected to the app. It returns raw integer currentAllowance, requiredAmount, sufficient, and block context. It sends no approval.

Phase 3 needs either a pre-funded, pre-approved K or separately authorized bounded ERC-20 approvals through KeeperHub. An approval is a separate onchain effect with its own simulation, persisted key and receipt. Existing allowances may suffice; they should be read first. Approval transactions can consume gas and finite allowance may be consumed by protection. Unlimited approval is not part of this design.

Phase 2 currently discovers B's wallet balances. Before execution, Phase 3 must replace the available protection balances with K's balances, while retaining B's Aave position. A browser balance is not evidence that KeeperHub can spend that balance.
