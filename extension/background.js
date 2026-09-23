// The part that runs without anyone looking: it keeps TODAY's card fresh on an
// alarm, writes the number onto the toolbar badge, and leaves the payload in
// storage so opening the popup paints instantly instead of starting a crawl.
//
// A service worker is killed between alarms, so nothing may live in a module
// variable across ticks — every entry point re-reads settings and cache from
// chrome.storage.
import {
  DEFAULTS,
  loadSettings,
  rangeFor,
  fetchSummary,
  fetchTickets,
  buildCard,
  errorKind,
  hostLabel,
} from './lib/kpi.js';
import { makeT, resolveLocale } from './lib/i18n.js';

const ALARM = 'kpi-refresh';

// The badge always shows TODAY, whatever range the popup was last left on: a
// number on the toolbar with no visible label has to mean one fixed thing, and
// "how am I doing right now" is the only reading that needs no caption.
const BADGE_RANGE = 'today';

export const cacheKey = (range) => `cache:${range}`;

async function readCache(range) {
  const key = cacheKey(range);
  const stored = await chrome.storage.local.get(key);
  return stored[key] || null;
}

async function writeCache(range, entry) {
  await chrome.storage.local.set({ [cacheKey(range)]: entry });
}

// Chrome truncates the badge past ~4 characters, so both forms are kept short:
// a rounded score ("64") or a place ("#2").
function badgeFor(card, mode, t) {
  if (!card?.row) return { text: '', color: '#5f5b53', title: t('badgeNoName') };
  const { row, total } = card;
  const text = mode === 'rank' ? `#${row.rank}` : String(Math.round(row.final));
  const color = row.rank === 1 ? '#a8761e' : row.rank <= 3 ? '#c4522f' : '#5f5b53';
  const title =
    t('badgeTitle', { name: row.name, rank: row.rank, total, score: row.final }) +
    (row.grandPrixEligible ? '' : ` · ${t('badgeSmallSample')}`);
  return { text, color, title };
}

async function paintBadge(card, mode, t) {
  const { text, color, title } = badgeFor(card, mode, t);
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setTitle({ title });
}

// Fetch one range and cache it. Returns the cache entry so callers can paint
// from the same object they stored. `force` is live mode's tick: it bypasses
// the server's crawl cache, which only a single-day range is allowed to do.
export async function refresh(range = BADGE_RANGE, settings = null, { force = false } = {}) {
  const cfg = settings || (await loadSettings());
  const { from, to } = rangeFor(range);
  try {
    const summary = await fetchSummary({ host: cfg.host, from, to, refresh: force && range === 'today' });
    const entry = { at: Date.now(), from, to, summary, error: null };
    await writeCache(range, entry);
    if (range === BADGE_RANGE) {
      const t = makeT(resolveLocale(cfg.locale));
      await paintBadge(buildCard(summary, { ...cfg, locale: t.locale }), cfg.badge, t);
    }
    return entry;
  } catch (err) {
    // A failed refresh must not erase a good card — the last payload stays in
    // the cache and the popup keeps rendering it under a "stale" note.
    const prev = await readCache(range);
    const entry = { ...(prev || { summary: null }), from, to, error: String(err?.message || err) };
    await writeCache(range, entry);
    if (range === BADGE_RANGE && !prev?.summary) {
      await chrome.action.setBadgeText({ text: '!' });
      await chrome.action.setBadgeBackgroundColor({ color: '#a3352b' });
      // Same plain words as the popup, never the raw exception.
      const t = makeT(resolveLocale(cfg.locale));
      const kind = errorKind(entry.error);
      const key = kind === 'botCheck' ? 'errBotCheck' : kind === 'network' ? 'errNetwork' : 'errServer';
      await chrome.action.setTitle({ title: `KPI px — ${t(key, { host: hostLabel(cfg.host) })}` });
    }
    return entry;
  }
}

// The viewer's own ticket list for a range, cached like the summary is. Only
// ever fetched on demand — the popup asks when someone opens the Tickets tab,
// never on the alarm, because nothing on the toolbar depends on it.
export async function refreshTickets(range = BADGE_RANGE, settings = null) {
  const cfg = settings || (await loadSettings());
  const { from, to } = rangeFor(range);
  const key = `tickets:${range}`;
  if (!cfg.operatorId) return { at: Date.now(), from, to, tickets: null, error: null };
  try {
    const body = await fetchTickets({ host: cfg.host, operatorId: cfg.operatorId, from, to });
    const entry = { at: Date.now(), from, to, operatorId: cfg.operatorId, ...body, error: null };
    await chrome.storage.local.set({ [key]: entry });
    return entry;
  } catch (err) {
    const stored = await chrome.storage.local.get(key);
    const prev = stored[key];
    // A failed refresh keeps the last good list, exactly as the summary does.
    const entry = { ...(prev || { tickets: null }), from, to, error: String(err?.message || err) };
    await chrome.storage.local.set({ [key]: entry });
    return entry;
  }
}

async function arm(settings = null) {
  const cfg = settings || (await loadSettings());
  const minutes = Math.max(1, Number(cfg.refreshMinutes) || DEFAULTS.refreshMinutes);
  await chrome.alarms.clear(ALARM);
  await chrome.alarms.create(ALARM, { periodInMinutes: minutes, delayInMinutes: minutes });
}

chrome.runtime.onInstalled.addListener(async () => {
  await arm();
  await refresh();
});

chrome.runtime.onStartup.addListener(async () => {
  await arm();
  await refresh();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM) return;
  await refresh();
});

// Settings changed (options page): re-arm if the cadence moved, and repaint the
// badge right away rather than making the user wait out the current period.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'sync') return;
  if (changes.refreshMinutes) await arm();
  if (changes.operatorId || changes.operatorName || changes.badge || changes.host || changes.locale) {
    await refresh();
  }
});

// The popup asks for a refresh when it is opened, when its ⟳ is pressed, and on
// every live-mode tick (`live: true`). The worker owns every fetch so the popup closing mid-request cannot abort it.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'refresh') {
    refresh(msg.range || BADGE_RANGE, null, { force: msg.live === true }).then(sendResponse);
    return true; // async response
  }
  if (msg?.type === 'tickets') {
    refreshTickets(msg.range || BADGE_RANGE).then(sendResponse);
    return true;
  }
  return undefined;
});
