# Network support verification

Verified on 2026-09-08. PositionGuard supports **Base Sepolia (84532)** as its default development/demo network and **Base mainnet (8453)** as an optional production network.

## Evidence

- [KeeperHub Aave V3 plugin](https://docs.keeperhub.com/plugins/aave-v3) explicitly lists Ethereum, Base, Arbitrum and Optimism. Sepolia Aave plugin support is not inferred from generic chain availability.
- A real unauthenticated `GET https://app.keeperhub.com/api/chains` returned HTTP 200 during implementation. Its Base entry reported chainId 8453, chainType evm, isEnabled true, isTestnet false and explorerUrl https://basescan.org. This verifies the public catalog, not organization-specific wallet routing or write authorization. [Catalog contract](https://docs.keeperhub.com/api/chains).
- [Base network documentation](https://docs.base.org/get-started/connect-to-base) identifies chain ID 8453 and the public mainnet RPC. Use a dedicated BASE_RPC_URL for reliable operation; public endpoints can limit requests.
- Contract references come from the [Aave DAO Base address book](https://github.com/aave-dao/aave-address-book/blob/main/src/AaveV3Base.sol). Values are centralized in src/lib/chains/config.ts.
- Base Sepolia contracts and reserve tokens come from the official [Aave DAO Base Sepolia address book](https://github.com/aave-dao/aave-address-book/blob/main/src/AaveV3BaseSepolia.sol). KeeperHub's live catalog reported chain 84532 enabled as an EVM testnet; generic direct contract calls target the configured Pool rather than relying on an Aave plugin preset.

| Contract | Address |
| --- | --- |
| Pool | 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5 |
| Pool Data Provider | 0x0F43731EB8d45A581f4a36DD74F5f358bc90C73A |
| Pool Addresses Provider | 0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D |
| Oracle | 0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156 |

Base is the requested primary chain and has documented protocol/plugin overlap. No gas-price claim or write readiness is inferred from this choice.

## Runtime verification

Every position read checks RPC chain ID, deployed code at all four addresses, provider-to-Pool/oracle/data-provider links, and the data provider's Addresses Provider. The oracle must report USD's zero-address base currency and 100000000 base units. A changed address or incompatible base currency blocks the read instead of silently substituting constants.

Underlying token addresses are discovered from the verified Pool's getReservesList at the captured block. Token decimals must match Data Provider reserve configuration; relevant tokens require valid metadata and nonzero oracle prices. There is no frontend-supplied contract address or transaction calldata. The narrower transaction allowlist is centralized per chain in src/lib/chains/assets.ts.

This runtime discovery supports complete read-only asset representation. It is not a transaction execution allowlist; Phase 3 must explicitly constrain spending assets, funding wallet and protocol actions.

## Live proof

See the verification record in README.md for the actual RPC test outcome. Unit/integration tests use explicit contract fixtures and do not constitute live proof. No configured private RPC credentials or DATABASE_URL were present at the beginning of this phase.


## Phase 2.5 intent allowlist and checks

Read-only discovery still represents all Pool reserves. Transaction-intent construction is narrower: each chain allows only its verified Aave USDC and WETH reserve addresses. Base Sepolia uses Aave test USDC `0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f`, not Circle Base Sepolia USDC. verify:rpc checks both allowlisted assets are reserves and verifies token metadata against Data Provider configuration.

Phase 2.5 rerun verified the configured Base RPC at block 51046417 and completed the real Aave wallet read at block 51046419 (no collateral or debt). KeeperHub authentication and its enabled Base catalog entry passed. Database migration/CRUD remain blocked: the endpoint is IPv6-only and IPv6 TCP is unreachable from this environment. See [the final check record](phase-2.5-verification.md).
