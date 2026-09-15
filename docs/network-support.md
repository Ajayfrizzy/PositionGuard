# Network support

PositionGuard currently configures two Aave V3 networks:

| Network      | Chain ID | Role                                                                 |
| ------------ | -------: | -------------------------------------------------------------------- |
| Base Sepolia |    84532 | Default hackathon/demo environment; test assets only                 |
| Base mainnet |     8453 | Separately configured optional network; no mainnet execution claimed |

Chain contracts and explorer URLs are centralized in [src/lib/chains/config.ts](../src/lib/chains/config.ts). USDC/WETH execution allowlists are in [src/lib/chains/assets.ts](../src/lib/chains/assets.ts).

## Runtime verification

Before accepting an Aave read, PositionGuard verifies:

- RPC chain ID;
- deployed code for Pool, Pool Data Provider, Addresses Provider, and oracle;
- provider-to-Pool/oracle/Data Provider relationships;
- oracle USD base currency and unit;
- discovered reserve membership;
- token decimals and metadata; and
- nonzero reserve prices.

All position reads are block-pinned and the hash is checked again. A network/configuration mismatch fails closed.

## KeeperHub support

KeeperHub's chain catalog is checked for one enabled EVM entry matching the selected chain and expected testnet flag. Authenticated wallet/profile and key capability checks are separate. verify:keeperhub proves readiness only; actual routing is demonstrated by execution evidence.

The canonical historical execution is on Base Sepolia and is linked in [KeeperHub integration](keeperhub-integration.md). No universal EVM support or mainnet execution is claimed.
