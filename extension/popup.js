// The popup: the whole team's board, with you marked in it.
//
// It deliberately shows everyone rather than only the viewer's card. The score
// is a RANKING — every number on it means "against these people, on this
// range" — so a lone card answers "what is my number" but not the question
// anyone actually has, which is "against whom, and by how much". Picking your
// name pins your row to the top and feeds the badge; it is not a gate, and the
// board renders in full before anyone has picked anything.
//
// Painted from the last cached payload the instant it opens, then repainted
// when the worker comes back with fresh data. Nothing here fetches.
import {
  RANGES,
  MIN_SAMPLE,
  TZ,
  LIVE_POLL_MS,
  applyTheme,
  buildBoard,
  errorKind,
  findRow,
  hostLabel,
  loadSettings,
  saveSettings,
  rangeFor,
} from './lib/kpi.js';
import { makeT, resolveLocale } from './lib/i18n.js';

const $ = (id) => document.getElementById(id);
const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };
const PAGE = 25;

// Ticket timestamps are UTC; they are read in Tashkent, like every range in
// this extension.
const CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
});
const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, month: '2-digit', day: '2-digit' });

let settings = null;
let t = makeT('en');
let range = 'today';
// Which operator's criteria are open. The viewer's own row starts open —
// their breakdown is the one thing they came for — and tapping any row swaps
// it, so comparing two people is two taps.
let openId = null;
// Which view is up — the board, or the viewer's own tickets — and how much of
// the ticket list has been asked for. A month is ~390 tickets; painting them
// all into a 400 px panel costs more than anyone reads in one go.
//
// The tickets are a VIEW of their own, one tap from the header, rather than a
// tab on your row in the board: on a board where you sit third behind people
// with twice your tickets, reaching your own history meant scrolling past
// theirs first.
let view = 'board';
let shown = PAGE;
let ticketEntry = null;
// Live mode: the range is pinned to today and re-crawled every LIVE_POLL_MS
// while the popup is open. The popup's timer dies with the popup, which is the
// point — a closed popup goes back to the worker's normal alarm cadence.
let live = false;
let liveTimer = null;
let ticking = false;

// The range actually on screen: live mode overrides the picked one without
// forgetting it, so switching live off lands back where the viewer was.
const active = () => (live ? 'today' : range);

const cacheKey = (r) => `cache:${r}`;

async function readCache(r) {
  const stored = await chrome.storage.local.get(cacheKey(r));
  return stored[cacheKey(r)] || null;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// A wide range turns up CRM user ids that never took a task in it (117141 and
// 117222 on 01–20.09, `name: null`, 0 closed). They are SCORED — rating.js
// normalizes over them, so dropping them here would quietly move everyone
// else's number away from the dashboard's. They get a label instead, so a
// blank row is never a mystery.
const displayName = (row) => (typeof row.name === 'string' && row.name.trim()) || t('unnamed', { id: row.id });

// `Number(null)` is 0 and 0 IS finite, so a null must be rejected BEFORE the
// conversion — otherwise an unscored ticket reads "AI 0", which is a verdict
// nobody gave it.
const isNum = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

// Numbers in the viewer's own locale — «89,7» in Russian and Uzbek, not the
// English decimal point. One formatter per digit count, rebuilt with `t`.
const numFormats = new Map();
function num(v, digits = 0) {
  if (!isNum(v)) return '—';
  const key = `${t.intl}:${digits}`;
  if (!numFormats.has(key)) {
    numFormats.set(key, new Intl.NumberFormat(t.intl, { minimumFractionDigits: digits, maximumFractionDigits: digits }));
  }
  return numFormats.get(key).format(Number(v));
}

const clockText = (at) => new Date(at).toLocaleTimeString(t.intl, { hour: '2-digit', minute: '2-digit' });

// How often a fresh payload is due: the live tick when live, otherwise the
// worker's alarm.
const refreshMs = () => (live ? LIVE_POLL_MS : Math.max(1, Number(settings?.refreshMinutes) || 15) * 60000);

// Past two missed refreshes the worker has been failing quietly — the stamp
// turns into an absolute time in the warning colour, so an old board never
// passes for a current one.
const isStale = (at) => Boolean(at) && Date.now() - at > 2 * refreshMs();

function stamp(at) {
  if (!at) return '';
  const mins = Math.round((Date.now() - at) / 60000);
  if (isStale(at) || mins >= 60) return t('updatedAt', { time: clockText(at) });
  if (mins < 1) return t('justNow');
  // Not Intl.RelativeTimeFormat — see the note at the end of lib/i18n.js.
  return t('minutesAgo', { n: mins });
}

// The header's range, in the viewer's language: "1–23 Sept", «1–23 сент.».
// Dates are calendar days, so they are read as UTC midnight and formatted in
// UTC — no timezone can shift them by a day.
function periodText(from, to) {
  const at = (iso) => new Date(`${iso}T00:00:00Z`);
  try {
    const fmt = new Intl.DateTimeFormat(t.intl, { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const out = from === to ? fmt.format(at(from)) : fmt.formatRange(at(from), at(to));
    // Chrome's ICU can claim a locale and format it with ROOT data (see the
    // note at the end of lib/i18n.js); root month names are "M09".
    if (!/\bM\d{2}\b/.test(out)) return out;
  } catch {
    // formatRange missing — fall through to the numeric form.
  }
  const dm = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
  return from === to ? dm(from) : `${dm(from)}–${dm(to)}`;
}

// Notes announce themselves: a status politely, a failure at once.
function note(text, tone = '') {
  const p = el('p', `note${tone ? ` note--${tone}` : ''}`, text);
  p.setAttribute('role', tone === 'bad' ? 'alert' : 'status');
  if (tone !== 'bad') p.setAttribute('aria-live', 'polite');
  return p;
}

// A failure in plain words. The raw exception text stays in the worker's
// cache entry (and the toolbar tooltip); the panel says what happened and
// what to do. `at` is when the data still on screen was fetched, if any.
function errorText(error, at) {
  const host = hostLabel(settings?.host);
  const kind = errorKind(error);
  if (kind === 'botCheck') return t('errBotCheck', { host });
  const what = t(kind === 'network' ? 'errNetwork' : 'errServer', { host });
  const next = at ? t('errShowingFrom', { time: clockText(at) }) : t('errRetries');
  return `${what} ${next}`;
}

function renderRanges() {
  $('ranges').replaceChildren(
    ...RANGES.map(({ key }) => {
      const b = el('button', 'pill', t(`range_${key}`));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(key === active()));
      // Live is today by definition; the other ranges wait until it is off,
      // and say why rather than just greying out.
      b.disabled = live && key !== 'today';
      if (b.disabled) {
        b.title = t('liveRangeHint');
        b.setAttribute('aria-describedby', 'rangeHint');
      }
      b.addEventListener('click', () => selectRange(key));
      return b;
    })
  );
}

function renderViews() {
  $('views').replaceChildren(
    ...['board', 'tickets'].map((key) => {
      const b = el('button', 'tab', t(`view_${key}`));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(key === view));
      b.addEventListener('click', () => selectView(key));
      return b;
    })
  );
}

function renderLive() {
  $('rangeHint').textContent = t('liveRangeHint');
  $('live').setAttribute('aria-pressed', String(live));
  $('live').setAttribute('aria-label', t('liveAria'));
  $('liveLabel').textContent = t('live');
}

// ── Team tiles ───────────────────────────────────────────────────────────
// Four headline numbers, no plot: a stat tile is the right form for a single
// figure, and a bar chart of four unrelated measures would be a lie about
// their comparability.
function renderTiles(kpis) {
  const tiles = [
    { label: t('tile_closed'), value: num(kpis.closed), hint: t('tile_closedHint', { n: num(kpis.tasksInRange) }) },
    { label: t('tile_sla'), value: kpis.slaPct === null ? '—' : `${num(kpis.slaPct, 1)}%`, hint: t('tile_slaHint', { n: num(kpis.slaSample) }) },
    { label: t('tile_ai'), value: num(kpis.aiScore, 1), hint: t('tile_aiHint', { n: num(kpis.aiScoreSample) }) },
    { label: t('tile_customers'), value: num(kpis.uniqueCustomers), hint: t('tile_customersHint') },
  ];
  const wrap = el('div', 'tiles');
  for (const t of tiles) {
    const tile = el('div', 'tile');
    tile.append(
      el('span', 'tile__label', t.label),
      el('span', 'tile__value', t.value),
      el('span', 'tile__hint', t.hint)
    );
    wrap.append(tile);
  }
  return wrap;
}

// ── Criteria breakdown ───────────────────────────────────────────────────
function renderCriteria(row) {
  const list = el('ul', 'crit');
  for (const c of row.criteria) {
    const li = el('li', `crit__row${c.available ? '' : ' crit--na'}`);
    li.append(el('span', 'crit__label', c.label), el('span', 'crit__value', c.rawText));
    const bar = el('span', 'crit__bar');
    const fill = el('span', 'crit__fill');
    // One hue for every bar: these are magnitudes on a common 0–100 scale, and
    // colouring them by rank or by criterion would encode nothing real.
    fill.style.width = `${Math.max(0, Math.min(100, c.score ?? 0))}%`;
    bar.append(fill);
    li.append(bar);
    const meta = el('span', 'crit__meta');
    if (!c.available) meta.append(el('span', null, t('critNoData')));
    else meta.append(el('span', null, t('critScore', { score: num(c.score, 0), weight: num(c.weight, 0) })));
    if (c.reliable === false) meta.append(el('span', null, t('critSample', { n: num(c.sample), min: MIN_SAMPLE })));
    li.append(meta);
    list.append(li);
  }
  return list;
}

// ── Your own card ────────────────────────────────────────────────────────
// Deliberately COMPACT: your six bars live on your row in the board below,
// open by default, and repeating them here would push the board — the thing
// this popup is for — off the first screen. This is the hero number and where
// you place, nothing else.
function renderMine(row, board) {
  const card = el('section', 'mine');
  const top = el('div', 'mine__top');

  const who = el('div', 'mine__who');
  who.append(el('span', 'tag', t('you')), el('span', 'mine__name', displayName(row)));
  const rank = el('button', `rank rank--jump${row.rank === 1 && row.grandPrixEligible ? ' rank--gold' : ''}`);
  rank.type = 'button';
  rank.setAttribute('aria-label', t('jumpToRow', { rank: row.rank, total: board.total }));
  const medal = row.grandPrixEligible && MEDALS[row.rank] ? `${MEDALS[row.rank]} ` : '';
  rank.append(el('span', null, `${medal}#${row.rank}`), el('span', 'rank__of', t('rankOf', { n: board.total })));
  rank.addEventListener('click', jumpToMyRow);
  who.append(rank);

  const score = el('div', 'mine__score');
  // 0–100, ALWAYS. rating.js divides the weighted sum by the total weight, so
  // the weight total (90 here, because one criterion has no data) scales the
  // mix — it is not the denominator of the score.
  score.append(el('span', 'score', num(row.final, 1)), el('span', 'score__unit', t('perHundred')));

  top.append(who, score);
  card.append(top);

  const meta = el('p', 'mine__meta');
  const scored = row.criteria.filter((c) => c.available).length;
  // Separated by the flex gap, not by middle dots.
  meta.append(
    el('span', 'mine__stat', t('statClosed', { n: num(row.done) })),
    el('span', 'mine__stat', t('statAi', { v: num(row.raw.ai, 1) })),
    el('span', 'mine__stat', t('statPoints', { v: num(row.raw.difficulty, 1) })),
    el('span', null, t('statCriteria', { n: scored, total: row.criteria.length, weight: num(board.totalWeight) }))
  );
  card.append(meta);

  if (!row.grandPrixEligible) {
    card.append(
      note(t('notEligible', { n: row.samples.ai, min: MIN_SAMPLE }), 'warn')
    );
  }
  return card;
}

// ── The board ────────────────────────────────────────────────────────────
function renderBoard(board, mine) {
  const wrap = el('section', 'board');
  const head = el('div', 'board__head');
  const title = el('span', 'board__title');
  title.append(el('span', null, t('boardHead')), el('span', 'count', num(board.total)));
  head.append(title, el('span', 'board__headScore', t('boardScore')));
  wrap.append(head);

  const top = board.rows[0]?.final || 100;
  for (const row of board.rows) {
    const isMine = mine && row.id === mine.id;
    const isOpen = row.id === openId;
    const item = el('div', `op${isMine ? ' op--mine' : ''}${isOpen ? ' op--open' : ''}`);

    const line = el('button', 'op__line');
    line.type = 'button';
    line.setAttribute('aria-expanded', String(isOpen));
    // No `title`: a native tooltip in a 400 px panel lands on top of the panel
    // (seen live, covering the header), and every number it would carry is
    // already printed on the row.

    const medal = row.grandPrixEligible && MEDALS[row.rank] ? MEDALS[row.rank] : row.rank;
    line.append(el('span', 'op__rank', String(medal)), el('span', `op__name${row.name ? '' : ' op__name--unnamed'}`, displayName(row)));
    line.append(el('span', 'op__score', num(row.final, 1)));

    const bar = el('span', 'op__bar');
    const fill = el('span', 'op__fill');
    // Bars are scaled to the leader, not to 100 — on a tight board every bar
    // near-full would flatten the differences the ranking is about.
    fill.style.width = `${Math.max(2, Math.round((row.final / top) * 100))}%`;
    bar.append(fill);
    line.append(bar);

    const meta = el('span', 'op__meta');
    meta.append(
      el('span', null, t('statClosed', { n: num(row.done) })),
      el('span', null, t('statAi', { v: num(row.raw.ai, 1) })),
      el('span', null, t('statPoints', { v: num(row.raw.difficulty, 1) }))
    );
    if (!row.grandPrixEligible) {
      meta.append(el('span', 'op__flag', t('sampleShort', { n: row.samples.ai })));
    }
    line.append(meta);

    line.addEventListener('click', () => {
      openId = isOpen ? null : row.id;
      repaint();
    });
    item.append(line);
    if (isOpen) item.append(renderCriteria(row));
    wrap.append(item);
  }
  return wrap;
}

// ── Tickets (the viewer's own only) ──────────────────────────────────────
function durationText(seconds) {
  if (!isNum(seconds) || seconds < 0) return null;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return t('minutesShort', { n: Math.max(1, mins) });
  const hours = Math.round(mins / 6) / 10;
  return t('hoursShort', { n: num(hours, Number.isInteger(hours) ? 0 : 1) });
}

function renderTicket(ticket, multiDay) {
  const li = el('li', 'tk');

  const top = el('div', 'tk__top');
  top.append(el('span', 'tk__title', ticket.title || `#${String(ticket.id || '').slice(0, 8)}`));
  const chips = el('span', 'tk__chips');
  if (isNum(ticket.aiScore)) {
    chips.append(el('span', 'chip chip--ai', t('ticketsAi', { v: num(ticket.aiScore, 0) })));
  }
  // Points are null for anything not closed — it earned nothing, which is not
  // the same claim as zero (see operatorTicketsHandler.js).
  if (isNum(ticket.points)) {
    chips.append(el('span', 'chip', t('ticketsPoints', { v: num(ticket.points, 2) })));
  }
  top.append(chips);
  li.append(top);

  const meta = el('div', 'tk__meta');
  const when = ticket.startDate ? new Date(ticket.startDate) : null;
  if (when && !Number.isNaN(when.getTime())) {
    meta.append(el('span', null, multiDay ? `${DAY.format(when)} ${CLOCK.format(when)}` : CLOCK.format(when)));
  }
  const dur = durationText(Number(ticket.durationSeconds));
  if (dur) meta.append(el('span', null, dur));

  // An icon AND a word, never colour alone.
  const slaKey = ticket.sla === 'hit' ? 'slaHit' : ticket.sla === 'miss' ? 'slaMiss' : 'slaNone';
  const slaClass = ticket.sla === 'hit' ? ' tk__sla--hit' : ticket.sla === 'miss' ? ' tk__sla--miss' : '';
  meta.append(el('span', `tk__sla${slaClass}`, t(slaKey)));

  if (ticket.state && ticket.state !== 'closed') {
    meta.append(el('span', 'tk__state', t(ticket.state === 'cancelled' ? 'stateCancelled' : 'stateOpen')));
  }
  li.append(meta);
  // The category gets its own line rather than a fourth inline item: a wrapped
  // flex row leaves its separator dangling at the end of the line above, and
  // these category names are long ("Маркетинг Акции/Кешбеки/Купоны/…").
  if (ticket.category) li.append(el('div', 'tk__cat', ticket.category));
  return li;
}

function renderTickets() {
  const wrap = el('section', 'tickets');
  if (!ticketEntry) {
    wrap.append(note(t('ticketsLoading')));
    return wrap;
  }
  if (!ticketEntry.tickets) {
    wrap.append(note(`${t('ticketsFailed')} ${errorText(ticketEntry.error, null)}`, 'bad'));
    return wrap;
  }
  const all = ticketEntry.tickets;
  if (!all.length) {
    wrap.append(note(t('ticketsEmpty')));
    return wrap;
  }

  const multiDay = ticketEntry.from !== ticketEntry.to;
  const list = el('ul', 'tk-list');
  for (const ticket of all.slice(0, shown)) list.append(renderTicket(ticket, multiDay));
  wrap.append(list);

  const total = ticketEntry.meta?.totalTickets ?? all.length;
  const visible = Math.min(shown, all.length);
  if (visible < all.length || total > all.length) {
    const foot = el('div', 'tk-foot');
    foot.append(el('span', 'note', t('ticketsShown', { n: num(visible), total: num(total) })));
    if (visible < all.length) {
      const more = el('button', 'btn btn--sm', t('ticketsMore'));
      more.type = 'button';
      more.addEventListener('click', () => {
        shown += PAGE;
        repaint();
      });
      foot.append(more);
    }
    wrap.append(foot);
  }
  if (ticketEntry.error) {
    wrap.append(note(errorText(ticketEntry.error, ticketEntry.at), 'bad'));
  }
  return wrap;
}

// The header of the My tickets view: how many, and how this range went. The
// closed and SLA counts are over the LOADED rows — the server caps a list at
// 400 and says so in meta.truncated, which the pager's footer already shows.
function renderTicketsHead() {
  const head = el('div', 'tickets__head');
  const all = ticketEntry?.tickets;
  const total = ticketEntry?.meta?.totalTickets ?? all?.length;
  const title = el('span', 'tickets__title');
  title.append(el('span', null, t('ticketsHead')), el('span', 'count', isNum(total) ? num(total) : '…'));
  head.append(title);
  if (all?.length) {
    const closed = all.filter((x) => x.state === 'closed').length;
    const measured = all.filter((x) => x.sla === 'hit' || x.sla === 'miss');
    const hit = measured.filter((x) => x.sla === 'hit').length;
    const sum = el('span', 'tickets__sum');
    sum.append(
      el('span', null, t('ticketsClosed', { closed: num(closed) })),
      el('span', null, t('ticketsSla', { hit: num(hit), sla: num(measured.length) }))
    );
    head.append(sum);
  }
  return head;
}

// ── Paint ────────────────────────────────────────────────────────────────
let lastEntry = null;

function paint(entry) {
  lastEntry = entry;
  const { from, to } = rangeFor(active());
  $('dash').href = dashUrl(from, to);
  // Live needs no caption here: the pressed Live pill beside it is the caption.
  $('period').textContent = periodText(from, to);

  if (!entry?.summary) {
    $('body').replaceChildren(entry?.error ? renderFailure(entry.error, from, to) : note(t('loading')));
    renderStamp(null);
    return;
  }

  const board = buildBoard(entry.summary, t.locale);
  const mine = findRow(board.rows, settings);
  if (openId === null && mine) openId = mine.id;

  const parts = [];
  if (view === 'tickets') {
    // Your card on top, your tickets straight under it — nobody else's row in
    // between. A picked name with no task in range has no row, and still has
    // a (possibly empty) ticket list to show.
    if (mine) parts.push(renderMine(mine, board));
    if (settings.operatorId == null) parts.push(renderPickPrompt(t('ticketsPick')));
    else parts.push(renderTicketsHead(), renderTickets());
  } else {
    // Your own number first — it is what the popup is opened for — then the
    // team's headline tiles, then the board.
    if (mine) parts.push(renderMine(mine, board));
    else parts.push(renderPickPrompt());
    parts.push(renderTiles(board.kpis));
    if (board.total) parts.push(renderBoard(board, mine));
    else parts.push(note(t('emptyBoard')));
  }
  if (entry.error) parts.push(note(errorText(entry.error, entry.at), 'bad'));

  $('body').replaceChildren(...parts);
  renderStamp(entry.at);
}

const dashUrl = (from, to) => `${String(settings.host).replace(/\/+$/, '')}/?from=${from}&to=${to}`;

// The footer stamp: "Live, every 30 s" and the age as two spans (no joining
// dot), the age in the warning colour once it is stale.
function renderStamp(at) {
  const box = $('stamp');
  box.className = `foot__stamp${isStale(at) ? ' foot__stamp--stale' : ''}`;
  const bits = [live ? t('liveFoot') : '', stamp(at)].filter(Boolean);
  box.replaceChildren(...bits.map((text) => el('span', null, text)));
}

// Nothing cached AND the fetch failed: the plain reason, then the two ways
// out — try again now, or open the dashboard (which also clears a bot check).
function renderFailure(error, from, to) {
  const box = el('div', 'fail');
  box.append(note(errorText(error, null), 'bad'));
  const actions = el('div', 'fail__actions');
  const retry = el('button', 'btn btn--primary btn--sm', t('retry'));
  retry.type = 'button';
  retry.addEventListener('click', () => (live ? liveTick() : refresh()));
  const open = el('a', 'btn btn--sm', t('openDashboard'));
  open.href = dashUrl(from, to);
  open.target = '_blank';
  open.rel = 'noreferrer';
  actions.append(retry, open);
  box.append(actions);
  return box;
}

// Not a gate — a one-line offer above a board that is already readable.
function renderPickPrompt(text = t('pickPrompt')) {
  const box = el('div', 'prompt');
  box.append(el('span', 'note', text));
  const btn = el('button', 'btn btn--primary btn--sm', t('pickAction'));
  btn.type = 'button';
  btn.addEventListener('click', () => chrome.runtime.openOptionsPage());
  box.append(btn);
  return box;
}

// Fetched by the worker, never here, so closing the popup mid-request cannot
// abort it — and painted from the cache first, like everything else.
async function loadTickets() {
  if (settings.operatorId == null) return;
  const r = active();
  const cached = await chrome.storage.local.get(`tickets:${r}`);
  const entry = cached[`tickets:${r}`];
  // A list only replaces what is on screen if it is still the range on
  // screen — a range switch mid-request must not paint the old range's list.
  if (!ticketEntry && entry && entry.operatorId === settings.operatorId && entry.from === rangeFor(r).from && r === active()) {
    ticketEntry = entry;
    repaint();
  }
  let next;
  try {
    next = await chrome.runtime.sendMessage({ type: 'tickets', range: r });
  } catch (err) {
    next = { tickets: null, error: String(err?.message || err) };
  }
  if (r !== active()) return;
  // A failed live tick keeps the list already on screen, under a stale note.
  ticketEntry = next?.tickets || !ticketEntry?.tickets ? next : { ...ticketEntry, error: next?.error };
  repaint();
}

async function selectView(next) {
  if (next === view) return;
  view = next;
  shown = PAGE;
  renderViews();
  repaint();
  // Land on the top of the new view, not wherever the board was scrolled to.
  document.documentElement.scrollTop = 0;
  await saveSettings({ view });
  if (view === 'tickets') await loadTickets();
}

async function jumpToMyRow() {
  if (view !== 'board') await selectView('board');
  const row = document.querySelector('.op--mine');
  // jsdom has no scrollIntoView, and neither does a row that is not rendered.
  if (row && typeof row.scrollIntoView === 'function') {
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    row.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
  }
}

const repaint = () => paint(lastEntry);

async function selectRange(next) {
  if (live) return;
  range = next;
  openId = null;
  // A ticket list belongs to one range; keeping it across a range switch
  // would show yesterday's tickets under today's heading.
  ticketEntry = null;
  shown = PAGE;
  await saveSettings({ range });
  renderRanges();
  paint(await readCache(range));
  await refresh();
  if (view === 'tickets') await loadTickets();
}

// `force` bypasses the server's crawl cache — live mode's ticks only, and only
// ever for today (the server refuses it for anything wider anyway).
async function refresh({ force = false } = {}) {
  const r = active();
  $('refresh').dataset.busy = '1';
  try {
    const entry = await chrome.runtime.sendMessage({ type: 'refresh', range: r, live: force });
    if (r === active()) paint(entry);
  } catch (err) {
    // A failed tick keeps the board on screen, like a failed alarm does.
    if (r === active()) paint(lastEntry?.summary ? { ...lastEntry, error: String(err?.message || err) } : { error: String(err?.message || err) });
  } finally {
    delete $('refresh').dataset.busy;
  }
}

// One live tick: the summary with the cache bypassed, then — only if the
// tickets are on screen — the list, which the server reads from the entry the
// forced crawl just refilled. A tick that finds the last one still running is
// skipped rather than stacked.
async function liveTick() {
  if (ticking) return;
  ticking = true;
  try {
    await refresh({ force: true });
    if (view === 'tickets') await loadTickets();
  } finally {
    ticking = false;
  }
}

function armLive() {
  clearInterval(liveTimer);
  liveTimer = live ? setInterval(liveTick, LIVE_POLL_MS) : null;
}

async function toggleLive() {
  live = !live;
  renderLive();
  renderRanges();
  // Live changes the range whenever the picked one is not today; either way
  // the list on screen belongs to a range that just stopped being current.
  if (range !== 'today') {
    ticketEntry = null;
    shown = PAGE;
    openId = null;
  }
  paint(await readCache(active()));
  armLive();
  await saveSettings({ live });
  if (live) await liveTick();
  else {
    await refresh();
    if (view === 'tickets') await loadTickets();
  }
}

async function main() {
  settings = await loadSettings();
  applyTheme(settings.theme);
  t = makeT(resolveLocale(settings.locale));
  document.documentElement.lang = t.locale;
  $('refresh').setAttribute('aria-label', t('refresh'));
  $('settings').setAttribute('aria-label', t('settings'));
  $('dash').textContent = `${t('dashboard')} ↗`;
  range = RANGES.some((r) => r.key === settings.range) ? settings.range : 'today';
  view = settings.view === 'tickets' ? 'tickets' : 'board';
  live = settings.live === true;
  renderLive();
  renderRanges();
  renderViews();
  paint(await readCache(active())); // instant, from the last background refresh
  $('refresh').addEventListener('click', () => (live ? liveTick() : refresh().then(() => view === 'tickets' && loadTickets())));
  $('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('live').addEventListener('click', toggleLive);
  armLive();
  // Then revalidate — forced when live, so opening the popup in live mode is
  // itself the first tick rather than a 30 s wait for one.
  if (live) await liveTick();
  else {
    await refresh();
    if (view === 'tickets') await loadTickets();
  }
}

main();
