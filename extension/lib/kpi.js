// Everything the popup, the options page and the service worker share: the
// settings shape, date ranges, the one fetch, and the scoring that turns
// /api/summary into ONE operator's card.
//
// The card must agree with the dashboard's 🏆 Rating view to the decimal, so
// this file reproduces exactly two things from src/components/Leaderboard.jsx
// and nothing else:
//   1. criterion LABELS — rating.js's own labels are stale in four places and
//      may never be edited (see src/i18n/messages/leaderboard.js, which is the
//      correction table this mirrors);
//   2. the zeroing of weights for criteria nobody has data for, BEFORE
//      scoring. Leaderboard.jsx's long comment explains why: left at full
//      weight, an all-missing criterion feeds a flat 50 to everyone and
//      compresses the spread without changing anyone's place.
// Prize mode (rating.js's `strict`) is deliberately not exposed: the popup
// answers "where do I stand", and the dashboard's own default is off.
import { METRICS, DEFAULT_WEIGHTS, availableMetrics, computeLeaderboard, MIN_SAMPLE } from './rating.js';
import { makeT } from './i18n.js';

export { METRICS, MIN_SAMPLE };

// How each criterion's RAW value is written — same kinds the xlsx export uses.
const FORMAT = {
  ai: 'dec',
  quantity: 'int',
  speed: 'pct',
  companiesCreated: 'int',
  crmReach: 'int',
  difficulty: 'dec',
};

// The team is in Tashkent, so "today" is Tashkent's today — not the laptop's.
// A machine left on UTC (or a trip abroad) must not silently shift the range
// by a day and make the card disagree with the dashboard everyone else sees.
export const TZ = 'Asia/Tashkent';

export const DEFAULTS = {
  host: 'https://auo.uz',
  operatorId: null,
  operatorName: '',
  range: 'today',
  refreshMinutes: 15,
  badge: 'score',
  // 'auto' follows Chrome's UI language; 'en' | 'ru' | 'uz' override it.
  locale: 'auto',
  // Live mode pins the range to today and re-crawls every LIVE_POLL_MS while
  // the popup is open. Kept as a setting (the dashboard's is not) because a
  // popup is reopened dozens of times a day, and whoever wants live wants it
  // every time.
  live: false,
  // 'board' | 'tickets' — which view the popup opens on.
  view: 'board',
};

// The dashboard's own live cadence (src/config.js POLL_INTERVAL_MS).
export const LIVE_POLL_MS = 30000;

export async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

export async function saveSettings(patch) {
  await chrome.storage.sync.set(patch);
}

// ── Dates ────────────────────────────────────────────────────────────────
// Intl with an explicit timeZone is the only way to ask "what is the date in
// Tashkent right now" without pulling in a date library; 'en-CA' is the locale
// whose numeric format IS ISO (YYYY-MM-DD).
const ISO = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const WEEKDAY = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });
const DAY_INDEX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

export function isoDate(d = new Date()) {
  return ISO.format(d);
}

const DAY_MS = 86400000;

export const RANGES = [{ key: 'today' }, { key: 'week' }, { key: 'month' }];

// from/to for a range key, both inclusive and both in Tashkent's calendar.
// The week starts Monday (the rota's own week — see SCHEDULE.md) and the month
// on the 1st; both end TODAY rather than at the period's end, because a range
// running into the future only widens the crawl for no data.
// The range the OPTIONS PAGE asks for when it fills the name picker. Today's
// payload lists only whoever had a task today — five people on 20.09, six on
// 19.09, against fourteen across the month — so a picker built from it cannot
// find someone on a day off, on leave, or simply before their shift starts.
//
// A rolling 30 days is the window that always holds the whole team (13 names
// on 22.08–20.09, against 5 that day), and it mirrors the '30d' preset in
// scripts/warm-cache.cjs (and FilterBar.jsx), so it rides the range the cron
// already warms. Measured live 20.09: 5.7 s cold, 2.3 s warm — which is why
// only the options page asks for it, once, behind a "Loading operators…"
// state, and never the popup. A calendar month-to-date would collapse to a
// handful of names every 1st.
export function rosterRange(now = new Date()) {
  return { from: isoDate(new Date(now.getTime() - 29 * DAY_MS)), to: isoDate(now) };
}

export function rangeFor(key, now = new Date()) {
  const to = isoDate(now);
  if (key === 'week') {
    const back = DAY_INDEX[WEEKDAY.format(now)] ?? 0;
    return { from: isoDate(new Date(now.getTime() - back * DAY_MS)), to };
  }
  if (key === 'month') {
    return { from: `${to.slice(0, 7)}-01`, to };
  }
  return { from: to, to };
}

// ── Fetch ────────────────────────────────────────────────────────────────
// /api/summary takes no credentials (server/index.mjs:465 — it is the one
// public read route), so the request is sent with credentials omitted: the
// extension never wants the user's admin session cookie riding along.
//
// The non-JSON branch is not paranoia. auo.uz sits behind ahost's edge, which
// has answered plain HTTP clients with a 200 + a ~12 KB JS bot-challenge page
// before; res.json() on that throws a parse error that reads like a bug in
// this code. Naming it keeps the popup's error honest.
//
// `refresh` asks the server to bypass its 10-minute crawl cache. The server
// honours that for a single-day range from anyone (refreshAllowed in
// src/server/taskSummaryHandler.js — the dashboard's live mode depends on the
// same exception) and silently ignores it for anything wider, so it is only
// ever sent for today.
export async function fetchSummary({ host, from, to, refresh = false, signal } = {}) {
  const base = String(host || DEFAULTS.host).replace(/\/+$/, '');
  const url =
    `${base}/api/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` +
    (refresh && from === to ? '&refresh=1' : '');
  const res = await fetch(url, {
    credentials: 'omit',
    headers: { Accept: 'application/json' },
    signal,
  });
  const type = res.headers.get('content-type') || '';
  if (!type.includes('application/json')) {
    if (!res.ok) throw new Error(`${base} answered HTTP ${res.status}`);
    throw new Error(`${base} answered HTML, not JSON — the host's bot check is likely back`);
  }
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error || body?.message || `HTTP ${res.status}`);
  return body;
}

// /api/operator-tickets — ONE operator's per-ticket history for the same range
// (src/server/operatorTicketsHandler.js). It is served from the very cache
// entry /api/summary just populated, so opening the list never pays for a
// second crawl.
//
// The extension asks for the VIEWER's own tickets and nobody else's. The
// endpoint's anonymous shape carries no customer identity by design — titles,
// categories, scores and timestamps only — but "which tickets did X handle"
// is still a different question from "where does X place", and the board
// answers only the second one for other people.
export async function fetchTickets({ host, operatorId, from, to, signal } = {}) {
  const base = String(host || DEFAULTS.host).replace(/\/+$/, '');
  const url =
    `${base}/api/operator-tickets?operator=${encodeURIComponent(operatorId)}` +
    `&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const res = await fetch(url, { credentials: 'omit', headers: { Accept: 'application/json' }, signal });
  const type = res.headers.get('content-type') || '';
  if (!type.includes('application/json')) {
    if (!res.ok) throw new Error(`${base} answered HTTP ${res.status}`);
    throw new Error(`${base} answered HTML, not JSON — the host's bot check is likely back`);
  }
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error || body?.message || `HTTP ${res.status}`);
  return body;
}

// ── Scoring ──────────────────────────────────────────────────────────────
export function formatRaw(key, value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  if (FORMAT[key] === 'int') return String(Math.round(n));
  if (FORMAT[key] === 'pct') return `${Math.round(n * 10) / 10}%`;
  return String(Math.round(n * 10) / 10);
}

// The whole board, scored the way the dashboard scores it.
export function scoreBoard(summary) {
  const operators = Array.isArray(summary?.operators) ? summary.operators : [];
  const scored = operators.filter((o) => o?.scored !== false);
  const available = availableMetrics(scored);
  const weights = Object.fromEntries(
    METRICS.map((m) => [m.key, available[m.key] ? Number(DEFAULT_WEIGHTS[m.key]) || 0 : 0])
  );
  return { ...computeLeaderboard(operators, weights, { strict: false }), weights };
}

// One scored row's six criteria, in METRICS order. The label comes from the
// dashboard's own translated table (see lib/metricLabels.js) — never from
// rating.js, whose wording is stale in four places and frozen.
function criteriaFor(row, board, t) {
  return METRICS.map((m) => ({
    key: m.key,
    label: t.metric(m.key),
    weight: board.weights[m.key],
    available: board.available[m.key],
    raw: row.raw[m.key],
    rawText: formatRaw(m.key, row.raw[m.key]),
    // The 0–100 position among the operators in range — the number the
    // weighted score is actually built from, not the raw value.
    score: board.available[m.key] ? row.scores[m.key] : null,
    sample: row.samples[m.key] ?? null,
    reliable: row.reliable[m.key] ?? null,
  }));
}

// The WHOLE board, every operator carrying their own criteria. The popup shows
// the team, not just the viewer: everyone is being ranked against everyone
// else, so a card with no board to sit in answers "what is my number" but not
// the question people actually have, which is "against whom".
export function buildBoard(summary, locale = 'en') {
  const board = scoreBoard(summary);
  const t = makeT(locale);
  return {
    rows: board.rows.map((row) => ({ ...row, criteria: criteriaFor(row, board, t) })),
    total: board.rows.length,
    totalWeight: board.totalWeight,
    available: board.available,
    kpis: summary?.kpis || {},
    computedAt: summary?.computedAt || null,
  };
}

// Which row is "you". Matched on id first and name second, so a picked
// operator survives a rename and a hand-typed name still resolves.
export function findRow(rows, ref = {}) {
  const wanted = ref.operatorId != null ? String(ref.operatorId) : '';
  const name = (ref.operatorName || '').trim().toLowerCase();
  return (
    rows.find((r) => wanted && String(r.id) === wanted) ||
    rows.find((r) => name && String(r.name || '').trim().toLowerCase() === name) ||
    null
  );
}

// The board plus a `row` pointing at the viewer — what the badge reads.
export function buildCard(summary, ref = {}) {
  const board = buildBoard(summary, ref.locale);
  const row = findRow(board.rows, ref);
  return { ...board, row, criteria: row ? row.criteria : [], summary };
}

// Every operator the payload knows about — the options page's picker list.
//
// Nameless rows are dropped: a wide range turns up CRM user ids that never
// took a task in it (117141 and 117222 on 01–20.09, `name: null`, done 0).
// They are real rows, not a bug, but as picker entries they are blank options
// nobody can identify.
export function operatorChoices(summary) {
  return (Array.isArray(summary?.operators) ? summary.operators : [])
    .filter((o) => o?.scored !== false)
    .map((o) => ({ id: o.id, name: typeof o.name === 'string' ? o.name.trim() : '' }))
    .filter((o) => o.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}
