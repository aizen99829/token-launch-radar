// The token launch radar's value model and board construction.
//
// Everything on the board is derived from the sealed DefiLlama snapshot and
// nothing else: no protocol is named in this file, no value is hardcoded per
// protocol, and the same code run on the same snapshot writes the same board.
//
// The model, in one paragraph: a pre-token protocol's implied value is its TVL
// multiplied by an FDV/TVL multiple, a momentum factor and a maturity factor.
// The multiple is calibrated from the snapshot itself — for each category it
// is the median market-cap/TVL ratio of the protocols in that category whose
// token already trades, so the radar prices a lending protocol the way the
// market already prices launched lending protocols. The momentum factor
// rewards seven-day TVL growth and discounts shrinkage, in a capped band.
// The maturity factor credits a protocol for the years it has run with no
// token: a product that has held TVL for years without issuing is a stronger
// launch candidate than one listed last month. Protocols whose token already
// trades are carried as launched anchors, valued at their recorded market
// cap, and flagged `launched` everywhere they appear.

import { farmSteps } from './farm.ts';

/** One protocol record, exactly the snapshot's ten fields. */
export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The sealed snapshot: a protocol list, a watchlist, and the fetch facts. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

/** How one protocol's implied value was reached, shown in its detail view. */
export interface Breakdown {
  base_multiple: number;
  calibration_peers: number;
  momentum_factor: number;
  maturity_factor: number;
  age_days: number | null;
}

/** A board row: the gate's fields plus everything the dashboard renders. */
export interface Row {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  status: 'pre-token' | 'launched';
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  on_watchlist: boolean;
  breakdown: Breakdown;
  farm_steps: string[];
}

/** The whole radar: the board plus the facts the dashboard header states. */
export interface Radar {
  as_of: string;
  source: string;
  floor_usd: number;
  scanned: number;
  watchlist_size: number;
  pre_token_rows: number;
  launched_rows: number;
  rows: Row[];
}

const DAY_MS = 86_400_000;
/** A category needs at least this many launched peers before its own median is trusted. */
const MIN_PEERS = 3;
/** Multiples are clamped to this band so one thin category cannot dominate the board. */
const MULTIPLE_MIN = 0.03;
const MULTIPLE_MAX = 3;
/** Board shape: how many pre-token rows and launched anchors the radar carries. */
export const PRE_TOKEN_ROWS = 185;
export const LAUNCHED_ROWS = 25;

/** Parse the snapshot's JSON text, refusing anything that is not its shape. */
export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist) || typeof raw.as_of !== 'string') {
    throw new Error('snapshot: not the sealed DefiLlama snapshot shape');
  }
  return raw;
}

/** The conventional median: the middle value, or the mean of the middle pair. */
const median = (xs: number[]): number => {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Whole days between two UTC dates (YYYY-MM-DD), or null when either is missing. */
function daysBetween(from: string | null, to: string): number | null {
  if (from === null) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / DAY_MS));
}

/**
 * Calibrate the FDV/TVL multiple of every category from the snapshot's own
 * launched protocols: the median market-cap/TVL ratio of the category's
 * trading peers, or the global launched median where a category has too few
 * peers to speak for itself.
 */
export function calibrate(protocols: Protocol[]): { byCategory: Map<string, { multiple: number; peers: number }>; global: number } {
  const ratios = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    all.push(ratio);
    if (p.category !== null) {
      const list = ratios.get(p.category) ?? [];
      list.push(ratio);
      ratios.set(p.category, list);
    }
  }
  const global = clamp(median(all), MULTIPLE_MIN, MULTIPLE_MAX);
  const byCategory = new Map<string, { multiple: number; peers: number }>();
  for (const [category, list] of ratios) {
    byCategory.set(category, {
      multiple: list.length >= MIN_PEERS ? clamp(median(list), MULTIPLE_MIN, MULTIPLE_MAX) : global,
      peers: list.length,
    });
  }
  return { byCategory, global };
}

/**
 * Score one pre-token protocol: TVL x calibrated multiple x momentum x
 * maturity, rounded to whole dollars. The breakdown travels with the row so
 * the dashboard can show its working, not just its answer.
 */
export function impliedValue(
  p: Protocol,
  calib: ReturnType<typeof calibrate>,
  asOf: string,
): { value: number; breakdown: Breakdown } {
  const cal = (p.category !== null ? calib.byCategory.get(p.category) : undefined) ?? { multiple: calib.global, peers: 0 };
  const momentum = p.change_7d === null ? 1 : 1 + (0.6 * clamp(p.change_7d, -25, 25)) / 100;
  const ageDays = daysBetween(p.listed_at, asOf);
  const years = ageDays === null ? 0 : ageDays / 365.25;
  const maturity = Math.min(1.5, 1 + 0.12 * Math.log(1 + years));
  const value = Math.max(1, Math.round(p.tvl_usd * cal.multiple * momentum * maturity));
  return {
    value,
    breakdown: {
      base_multiple: cal.multiple,
      calibration_peers: cal.peers,
      momentum_factor: momentum,
      maturity_factor: maturity,
      age_days: ageDays,
    },
  };
}

const byValueDesc = (a: Row, b: Row): number =>
  b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1);

/** Build the ranked board: pre-token protocols by implied value, watchlist guaranteed, launched anchors merged in. */
export function buildBoard(snapshot: Snapshot): Row[] {
  const calib = calibrate(snapshot.protocols);
  const watchlist = new Set(snapshot.watchlist);
  const rows: Row[] = [];

  const preToken = snapshot.protocols.filter((p) => p.mcap_usd === null);
  const scored = preToken
    .map((p) => {
      const { value, breakdown } = impliedValue(p, calib, snapshot.as_of);
      return { p, value, breakdown };
    })
    .sort((a, b) => b.value - a.value || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));

  const chosen = scored.slice(0, PRE_TOKEN_ROWS);
  const chosenSlugs = new Set(chosen.map((c) => c.p.slug));
  // The watchlist is the floor: swap any missing watchlist protocol in for
  // the weakest chosen row that is not itself on the watchlist.
  for (const c of scored) {
    if (!watchlist.has(c.p.slug) || chosenSlugs.has(c.p.slug)) continue;
    for (let i = chosen.length - 1; i >= 0; i--) {
      if (!watchlist.has(chosen[i]!.p.slug)) {
        chosenSlugs.delete(chosen[i]!.p.slug);
        chosen[i] = c;
        chosenSlugs.add(c.p.slug);
        break;
      }
    }
  }
  for (const { p, value, breakdown } of chosen) {
    rows.push({
      slug: p.slug, name: p.name, rank: 0, implied_value_usd: value, status: 'pre-token',
      category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, change_7d: p.change_7d,
      mcap_usd: null, listed_at: p.listed_at, on_watchlist: watchlist.has(p.slug),
      breakdown, farm_steps: farmSteps(p, 'pre-token'),
    });
  }

  const launched = snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0)
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || (a.slug < b.slug ? -1 : 1))
    .slice(0, LAUNCHED_ROWS);
  for (const p of launched) {
    rows.push({
      slug: p.slug, name: p.name, rank: 0, implied_value_usd: p.mcap_usd!, status: 'launched',
      category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, change_7d: p.change_7d,
      mcap_usd: p.mcap_usd, listed_at: p.listed_at, on_watchlist: false,
      breakdown: { base_multiple: p.tvl_usd > 0 ? p.mcap_usd! / p.tvl_usd : 0, calibration_peers: 0, momentum_factor: 1, maturity_factor: 1, age_days: daysBetween(p.listed_at, snapshot.as_of) },
      farm_steps: farmSteps(p, 'launched'),
    });
  }

  rows.sort(byValueDesc);
  rows.forEach((row, i) => { row.rank = i + 1; });
  return rows;
}

/** Assemble the radar object the dashboard renders. */
export function buildRadar(snapshot: Snapshot): Radar {
  const rows = buildBoard(snapshot);
  return {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    scanned: snapshot.protocols.length,
    watchlist_size: snapshot.watchlist.length,
    pre_token_rows: rows.filter((r) => r.status === 'pre-token').length,
    launched_rows: rows.filter((r) => r.status === 'launched').length,
    rows,
  };
}

/**
 * Check a board against the gate's rules, in the gate's own terms; returns
 * the first refusal, or null when the board is one the gate accepts.
 */
export function boardIssue(rows: Row[], snapshot: Snapshot): string | null {
  if (rows.length < 100 || rows.length > 4000) return `board holds ${rows.length} rows, outside 100..4000`;
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (const row of rows) {
    if (!slugs.has(row.slug)) return `row slug ${row.slug} is not one of the snapshot's protocols`;
    if (seen.has(row.slug)) return `row slug ${row.slug} appears twice`;
    seen.add(row.slug);
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) return `row ${row.slug}: implied value is not a positive whole number`;
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) return `row ${row.slug}: farm_steps outside 3..12`;
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `row ${row.slug}: a farm step is ${len} characters, outside 20..600`;
    }
  }
  const byRank = [...rows].sort((a, b) => a.rank - b.rank);
  for (let i = 0; i < byRank.length; i++) {
    if (byRank[i]!.rank !== i + 1) return `ranks are not exactly 1..${byRank.length}`;
    if (i > 0 && byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `implied value rises at rank ${i + 1}`;
  }
  if (new Set(rows.map((r) => r.implied_value_usd)).size < 2) return 'every implied value is the same: not a ranking';
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist protocol ${slug} is missing from the board`;
  }
  return null;
}

/** The dashboard's data, as a script the page loads beside its index.html. */
export function dataScript(radar: Radar): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}
