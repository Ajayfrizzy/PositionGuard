# Demo wallet and funding requirements

## Protected account

The protected account must be user-owned and verified through the signed onboarding challenge. For a meaningful live position demonstration, it needs supported Aave V3 collateral or debt on Base Sepolia. A no-debt wallet is valid for onboarding/read verification but cannot demonstrate an intervention.

The simplest supported position uses eligible WETH collateral and variable-rate debt in Aave's configured Base Sepolia test USDC. Unsupported eMode, stable debt, isolation, or reconciliation blocks execution estimation.

## Execution wallet

The KeeperHub organization execution wallet must match KEEPERHUB_EXECUTION_WALLET, hold the exact underlying asset, and have sufficient allowance to the Base Sepolia Aave Pool. It is distinct from the protected account.

For repayment it needs Aave reserve USDC at 0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f. Circle Base Sepolia USDC cannot repay this reserve. For collateral supply it needs WETH at 0x4200000000000000000000000000000000000006.

Read readiness without approving or broadcasting:

```sh
npm run verify:keeperhub
npm run verify:allowance -- USDC 0.212852
```

Replace amount with the current engine candidate. PositionGuard does not create allowances or wrap ETH.

## Configuration

Required hosted configuration includes reachable PostgreSQL, Base Sepolia RPC, default chain, KeeperHub key, execution-wallet pin, operator/broadcast tokens, and matching worker identity/environment. Webhook values are optional. Keep all secrets server-only.

## Existing demo evidence

The final video can use the persisted confirmed execution instead of creating a new risky position or transaction: 0.212852 USDC repaid through KeeperHub, with HF 1.549918707188866008 → 1.599999884615885683. See [the demo walkthrough](demo.md) and [Base Sepolia runbook](base-sepolia-demo.md).

Do not fund, approve, or broadcast based on illustrative documentation. Derive every amount from current Aave state and policy.

```

```
