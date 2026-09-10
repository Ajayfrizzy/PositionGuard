# Base Sepolia feasibility investigation

Checked 2026-09-08. A complete testnet demo is technically feasible using Aave V3 and KeeperHub direct contract calls on chain 84532. It is not yet implemented or demonstrated end-to-end. No broadcast, approval, faucet claim or funding was performed. The application's mainnet-only configuration was not changed.

## Official deployment and live evidence

[Aave's deployment list](https://aave.com/help/aave-101/accessing-aave) explicitly includes Base Sepolia V3. The [official address book](https://github.com/aave-dao/aave-address-book/blob/main/src/AaveV3BaseSepolia.sol) provides:

| Component | Address |
| --- | --- |
| Pool | 0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27 |
| Addresses Provider | 0xE4C23309117Aa30342BFaae6c95c6478e0A4Ad00 |
| Data Provider | 0xBc9f5b7E248451CdD7cA54e717a2BFe1F32b566b |
| Oracle | 0x943b0dE18d4abf4eF02A85912F8fc07684C141dF |
| Test USDC, 6 decimals | 0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f |
| WETH, 18 decimals | 0x4200000000000000000000000000000000000006 |

Live RPC at https://sepolia.base.org returned chain 84532 and block 46557547 at the beginning of the probe. Reads spanned subsequent blocks; these are a feasibility snapshot, not one atomic position snapshot. Pool/Data Provider code exists. getReservesList returned USDC, USDT, WBTC, WETH, cbETH and LINK.

USDC and WETH both reported active=true, frozen=false, paused=false, collateral enabled and variable borrowing enabled. USDC LTV/LT were 8250/8600 basis points; WETH 8350/8500. Oracle prices were nonzero. Available underlying was approximately 5,007,342.419019 test USDC and 181.939158702743356362 WETH. USDC borrow/supply caps were zero (uncapped); WETH caps were 1200/2500, with approximately 1020.924 WETH supplied. These values can change.

## KeeperHub direct calls

[KeeperHub platform reference](https://docs.keeperhub.com/platform-reference) lists Base Sepolia as stable. Live GET /api/chains confirmed chainId=84532, isEnabled=true, isTestnet=true, chainType=evm. The [Aave plugin documentation](https://docs.keeperhub.com/plugins/aave-v3) is separate from the generic [direct execution API](https://docs.keeperhub.com/api/direct-execution); a plugin network preset is not required when specifying the Pool address, ABI and chain directly.

All investigation POSTs used strict boolean simulate=true, native value zero and the official Pool target. No simulation flag was removed. Results:

| Probe | Actual result |
| --- | --- |
| getReservesList via contract-call | HTTP 200, returned the same six reserves; view-call response is result, not a successful write-simulation receipt |
| supply of 1 raw USDC unit | Simulated revert InvalidAmount |
| supply of 1 whole test USDC | Simulated revert: ERC20 transfer amount exceeds balance |
| borrow on behalf of protected wallet | Simulated revert, custom error; no successful borrow claimed. Creating B's debt through K would additionally require borrowing delegation; create the demo position from B instead |
| repay on behalf of protected wallet | Simulated revert selector 0xf0788fb2, matching NoDebtOfSelectedType() in official Aave Errors.sol |

Simulations reported sender 0xa7462e9f08c56053c87f3e2a35af8dbea4786531 and the expected testnet Pool. The previously authenticated key disclosed mcp:read, mcp:write and mcp:admin. These results establish real chain/contract simulation routing. Documented broadcast support exists, but successful funded simulation, actual broadcast routing, mining and receipt verification remain unproven. The documented EOA-versus-Safe simulation limitation still applies.

## Test assets and faucets

1. Obtain Base Sepolia ETH from the [Coinbase Developer Platform faucet](https://docs.cdp.coinbase.com/faucets/introduction/quickstart), selecting Base Sepolia and ETH. B needs gas for setup. K also needs a verified gas/sponsorship route; do not assume every Aave call is sponsored.
2. Wrap some Base Sepolia ETH into the listed WETH for collateral. Retain ETH for gas. This uses test assets only.
3. Obtain Aave-specific test USDC through the Aave interface: enable testnet mode, choose Base Sepolia, then Faucet. The [official interface configuration](https://github.com/aave/interface/blob/main/src/ui-config/marketsConfig.tsx) specifies faucet 0xD9145b5F45Ad4519c7ACcD6E0A4A82e83bB8A6Dc. Its faucet components construct token mint transactions. No claim was attempted, so current per-user faucet availability is not guaranteed.
4. Circle/KeeperHub's commonly listed Base Sepolia USDC, 0x036CbD53842c5426634e7929541eC2318f3dCF7e, is NOT this Aave reserve. A Circle USDC faucet balance cannot repay this Pool's test-USDC debt.

Suggested eventual flow: B supplies WETH and borrows Aave test USDC at variable rate. K obtains that exact test USDC for repayment, or WETH for collateral supply, and grants Pool allowance. KeeperHub then simulates and, only when authorized, executes repay(asset,amount,2,B) or supply(asset,amount,B,0). B owns the collateral/debt; K funds protection. No mainnet position is necessary to demonstrate this design.

## Work still required

Explicitly add chain 84532 and its verified contracts/assets throughout network validation, runtime reads, intent allowlists, CLI/API configuration and tests. Current PositionGuard only enables 8453; changing an RPC URL alone will correctly fail chain validation. Preserve network separation in persisted policies and executions. Resolve the existing database connectivity blocker, create a supported testnet debt-bearing position, verify K funding/allowances and actual sender route, and implement the planned simulation/idempotency/receipt lifecycle. Faucet claims and all setup/protection transactions remain future authorized work.
