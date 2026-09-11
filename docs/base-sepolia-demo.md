# Base Sepolia demo runbook

Base Sepolia (chain ID 84532) is PositionGuard's development and hackathon-demo network. Everything on this network is a test asset with no real-world value. Base mainnet remains separately supported for production use.

## Verified deployment

These addresses come from the official [Aave Base Sepolia address book](https://github.com/aave-dao/aave-address-book/blob/main/src/AaveV3BaseSepolia.sol):

| Component                      | Address                                      |
| ------------------------------ | -------------------------------------------- |
| Aave V3 Pool                   | `0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27` |
| Pool Data Provider             | `0xBc9f5b7E248451CdD7cA54e717a2BFe1F32b566b` |
| Addresses Provider             | `0xE4C23309117Aa30342BFaae6c95c6478e0A4Ad00` |
| Oracle                         | `0x943b0dE18d4abf4eF02A85912F8fc07684C141dF` |
| Aave reserve USDC (6 decimals) | `0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f` |
| WETH (18 decimals)             | `0x4200000000000000000000000000000000000006` |

The Aave reserve USDC above is not Circle's Base Sepolia USDC at `0x036CbD53842c5426634e7929541eC2318f3dCF7e`. Circle test USDC cannot repay debt in Aave's configured test-USDC reserve.

## Wallet roles

- Protected wallet B owns the Aave collateral and debt position.
- KeeperHub wallet K is the organization sender and provides the token used by a protection action.
- For repayment, K supplies the debt token and calls `repay(asset, amount, 2, B)`.
- For collateral addition, K supplies the collateral token and calls `supply(asset, amount, B, 0)`.

Never treat B's wallet token balance as proof that K can fund an action. Verify K's balance and K-to-Pool allowance independently.

## Create the demo position

1. Obtain Base Sepolia ETH for B from the [Coinbase Developer Platform faucet](https://docs.cdp.coinbase.com/faucets/introduction/quickstart), selecting Base Sepolia and ETH. Retain enough test ETH for setup gas. Fund K with test ETH only if the confirmed KeeperHub execution route requires it; do not assume every call is sponsored.
2. Wrap part of B's test ETH using the verified WETH contract or the Base Sepolia Aave interface. Keep some ETH unwrapped for gas.
3. In the official Aave interface, enable testnet mode, select Base Sepolia, and obtain the exact Aave reserve USDC shown above through Aave's configured faucet flow. The official [Aave interface market configuration](https://github.com/aave/interface/blob/main/src/ui-config/marketsConfig.tsx) identifies its testnet faucet. Faucet availability and limits can change, so confirm the interface transaction before signing.
4. From B, approve the chain-specific Aave Pool to spend the intended WETH amount, then supply WETH as collateral through Aave.
5. Confirm WETH is enabled as collateral for B. Enable it in Aave if the supply transaction did not enable it automatically.
6. From B, borrow the supported Aave test USDC using variable rate mode. Do not create the debt through K; borrowing on behalf of B would require separate credit delegation.
7. Set `BASE_SEPOLIA_RPC_URL`, `POSITIONGUARD_DEFAULT_CHAIN_ID=84532`, and `POSITIONGUARD_DEV_TOKEN`, then open `/dev/aave`. Select Base Sepolia and read B. Confirm chain ID 84532, the `TESTNET` label, collateral, debt, supplied/borrowed assets, protection balances, and the MEI result.

## Prepare and simulate protection

8. Fund K with the appropriate configured test asset: Aave reserve USDC for repayment, or WETH for collateral addition. Use the exact addresses in this document.
9. From K, approve the Base Sepolia Aave Pool `0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27` for at least the bounded action amount. Run `npm run verify:allowance -- USDC <amount>` or use `WETH` for collateral supply. The check reads K's allowance against the chain-specific configured Pool.
10. Build the server-side canonical repay or supply intent and run KeeperHub simulation on chain 84532. Confirm the reported sender is K, the target is the configured Pool, the asset is the configured reserve token, native value is zero, and simulation succeeds. A failed simulation must not be broadcast.
11. In a later explicitly authorized execution phase, re-read B's position, re-evaluate policy and MEI, re-check K's balance and allowance, reuse the stable intent fingerprint as the idempotency basis, and submit the protection transaction. Require a successful verified receipt on chain 84532 and independently confirm the Aave position effect.

PositionGuard currently constructs and validates intents but does not broadcast them.
