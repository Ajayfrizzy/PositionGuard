# Execution wallet model

PositionGuard separates the **protected account** from the **execution wallet**.

- The protected account is the user-owned wallet whose Aave collateral, debt, and HF are monitored.
- The execution wallet is KeeperHub's organization sender. It provides the underlying token and Pool allowance for a protection action.

A signed onboarding message proves ownership of the protected account but does not transfer spending authority. KeeperHub does not spend the protected account's wallet balance.

## Binding and readiness

KEEPERHUB_EXECUTION_WALLET pins the expected sender. PositionGuard verifies authenticated KeeperHub wallet/profile consistency, disclosed capability, simulation sender, and the configured pin. For each candidate it reads the execution wallet's exact token balance and allowance to the chain-specific Aave Pool.

For repay, the execution wallet calls repay(asset, amount, 2, protected account). For collateral supply, it calls supply(asset, amount, protected account, 0).

ETH is not treated as WETH. Base Sepolia Aave test USDC is not Circle test USDC. The application never creates an approval and never silently approves an unlimited amount.

## Canonical sender evidence

The server-built intent fingerprint includes expected sender and beneficiary. Simulation must report the expected sender and Pool. Independent execution verification checks direct Pool transaction identity when applicable and always requires the exact Aave event. Repay events must identify the expected execution wallet as repayer.

KeeperHub may route through sponsored account infrastructure, so organization wallet reads alone are not final route proof. The historical Base Sepolia execution supplies actual on-chain evidence; see [KeeperHub integration](keeperhub-integration.md).

## Operational requirement

Before simulation or execution, ensure the execution wallet holds the selected underlying token and has a Pool allowance covering at least the exact MEI amount. Use the read-only check:

```sh
npm run verify:allowance -- USDC 0.212852
```

Replace the symbol/amount with the live candidate. This command does not approve or broadcast.
