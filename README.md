# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/aizen99829/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/aizen99829/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar over the sealed DefiLlama snapshot of 14 November 2026: 758 protocols
scanned, ranked into a 210-row board — 185 protocols that record no token yet, priced by the
model below, plus the 25 largest already-launched protocols carried as anchors at their real
market cap. Every one of the snapshot's 40 watchlist protocols is on the board, and 170 rows
come from outside the watchlist: the early finds below the $50M floor are the point of a radar.

## The value model

No protocol is named in the model and no value is hardcoded. For each pre-token protocol:

**implied value = TVL × category multiple × momentum × maturity**, rounded to whole dollars.

- **Category multiple** — calibrated from the snapshot itself: the median market-cap/TVL ratio
  of the protocols *in the same category whose token already trades* (a category needs at
  least 3 launched peers, otherwise the global launched median is used), clamped to
  0,03×–3×. The radar prices a lending protocol the way the market already prices launched
  lending protocols.
- **Momentum** — `1 + 0,6 × clamp(change_7d, −25, +25) / 100`: seven-day TVL growth is
  rewarded, shrinkage discounted, inside a 0,85×–1,15× band. Unreported growth is neutral.
- **Maturity** — `1 + 0,12 × ln(1 + years)`, capped at 1,5×, where years is the time since
  DefiLlama began tracking the protocol: a product that has held TVL for years with no token
  is a stronger launch candidate than one listed last month. No listing date, no credit.

Launched protocols are never mixed into the ranking disguised as pre-token: they sit on the
board tagged LAUNCHED at their recorded market cap, so the scale next to a model's claim is
always a real price. An implied value is this board's own claim about what a token would be
worth if the protocol's record stayed as it is — not a prediction that one will be issued.

## The top of the board

The model's first ten contacts on this snapshot (values are implied unless marked real):

| # | Protocol | Category | TVL | Implied value |
|---|----------|----------|-----|---------------|
| 1 | Binance CEX | CEX | $116,08B | $9,84B |
| 2 | LayerZero V2 | Bridge | $17,67B | $9,83B |
| 3 | Coinbase Bridge | Bridge | $7,23B | $4,36B |
| 4 | WBTC | Bridge | $7,91B | $4,13B |
| 5 | Ethena USDe | Basis Trading | $4,90B | $3,71B |
| 6 | Hyperliquid Bridge | Bridge | $5,99B | $3,69B |
| 7 | Binance Bitcoin | Bridge | $4,66B | $2,78B |
| 8 | Rain | Prediction Market | $0,01B | $2,65B (real mcap, launched anchor) |
| 9 | USDT0 | Bridge | $3,57B | $2,31B |
| 10 | Aave V3 | Lending | $14,36B | $2,17B |

## Farm plans

Every row carries a concrete farm plan (4–8 steps) generated from the protocol's category,
chains and size: the actual actions (supply and loop on a lending market, bridge and hold,
provide liquidity, stake and restake, trade to volume tiers), what they cost in gas and
capital at that protocol's chain prices and TVL band, and how long they take — minutes a
day, over how many weeks. Growing protocols get a front-load step; shrinking ones get a
size-down warning.

## The dashboard

A static page (`dashboard/index.html`, `radar.css`, `radar.js`) in a dark radar-scope
aesthetic: the ranked board as a sortable, filterable table (search, status, chain,
category, TVL band), and a detail view per protocol showing its stats, the model's full
working — each factor, and where the multiple came from — and its farm plan. It renders
with no network; `main.ts` writes its data as `data.js` beside the page.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to>/snapshot.json
```

Node 22, standard library only. In the grader the snapshot is read from
`/input/snapshot.json` and the output written to `/output`: `board.json` (the ranked
board), `data.js` (the dashboard's data), `dashboard/`, `screenshots/` and `dossier.json`,
built with the vendored `vendor/makefun-board.ts`. Run it twice and the bytes are identical.

---
<sub>Entered on [make.fun](https://make.fun/?ref=2a9s4gx3&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
