<img src="assets/logo.svg" width="72" alt="BuilderKit logo">

# BuilderKit

**Dev toolkit for [Hyperliquid builder codes](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes).** Fee calculator, approval and order signing, signature inspector, info queries and fills analyzer.

**Live:** https://andrewdamelio.github.io/builderkit/

Everything runs client-side in a single static HTML file: EIP-712 signing, msgpack action hashing and LZ4 decoding. No server, no keys leave the browser.

## Tools

| # | Tool | What it does |
|---|------|--------------|
| 01 | **Fee calculator** | `f` (tenths of a bp) ↔ bps ↔ %, perps/spot cap checks, revenue model from routed volume |
| 02 | **Approval maker** | Builds and signs `approveBuilderFee`: action, EIP-712 v4 typed data, digest, `/exchange` body, TS + Python snippets. Sign with an ephemeral test key or an injected wallet |
| 03 | **Order tagger** | Attaches `builder: {b, f}` to an order action, computes the L1 action hash and phantom agent, and validates against caps, the user's approval and the spot-buy rule |
| 04 | **Signature inspector** | Paste a failing `/exchange` body to recover the real signer. Aimed at `User or API Wallet … does not exist` |
| 05 | **Info query builder** | `maxBuilderFee`, `clearinghouseState` (≥ 100 USDC check), `referral`, `userFills`. Generates curl/fetch/Python and decodes pasted responses |
| 06 | **Fills analyzer** | Generates `builder_fills` dataset URLs + download script, then decodes dropped `.csv.lz4` files into revenue, users, markets and hourly fees |
| 07 | **Preflight checklist** | Every requirement between you and your first builder fee |

## Correctness

The signing core (`src/core.js`) is tested byte-for-byte against the official [`hyperliquid-python-sdk`](https://github.com/hyperliquid-dex/hyperliquid-python-sdk):

- `approveBuilderFee` user-signed EIP-712 signatures
- order wire formatting (`float_to_wire` normalization, key order, lowercased builder)
- L1 action hash (`msgpack ‖ nonce ‖ vault flag ‖ expiresAfter`) and phantom-agent signatures on mainnet and testnet
- LZ4 frame decoding (linked blocks, checksums) against `lz4.frame`

```bash
pip install hyperliquid-python-sdk lz4
npm install
npm test
```

## Structure

```
index.html            built single-file site (what GitHub Pages serves)
src/core.js           pure signing / hashing / LZ4 / fee logic
src/index.src.html    UI source
build.py              inlines core.js into index.html
test/                 parity tests vs the Python SDK
```

Edit `src/`, then `npm run build`.

---

Independent tool, not affiliated with Hyperliquid. Built by [Andy D'Amelio](https://andrewdamel.io).
