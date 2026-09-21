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
import { RANGES, MIN_SAMPLE, TZ, buildBoard, findRow, loadSettings, saveSettings, rangeFor } from './lib/kpi.js';
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
// Which tab the viewer's own open row is on, and how much of the ticket list
// has been asked for. A month is ~390 tickets; painting them all into a 400 px
// panel costs more than anyone reads in one go.
let tab = 'criteria';
let shown = PAGE;
let ticketEntry = null;

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

const num = (v, digits = 0) => (isNum(v) ? Number(v).toFixed(digits) : '—');

function stamp(at) {
  if (!at) return '';
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return t('justNow');
  // Not Intl.RelativeTimeFormat — see the note at the end of lib/i18n.js.
  if (mins < 60) return t('minutesAgo', { n: mins });
  return new Date(at).toLocaleTimeString(t.intl, { hour: '2-digit', minute: '2-digit' });
}

function renderRanges() {
  $('ranges').replaceChildren(
    ...RANGES.map(({ key }) => {
      const b = el('button', 'pill', t(`range_${key}`));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(key === range));
      b.addEventListener('click', () => selectRange(key));
      return b;
    })
  );
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
    const bits = [];
    if (!c.available) bits.push(t('critNoData'));
    else bits.push(t('critScore', { score: Math.round(c.score), weight: c.weight }));
    if (c.reliable === false) bits.push(t('critSample', { n: c.sample, min: MIN_SAMPLE }));
    li.append(el('span', 'crit__meta', bits.join(' · ')));
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
  rank.append(
    el('span', null, `${medal}#${row.rank}`),
    el('span', 'rank__of', t('rankOf', { n: board.total })),
    el('span', 'rank__go', '↓')
  );
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
  meta.append(
    el('span', 'mine__stat', t('statClosed', { n: row.done })),
    el('span', 'op__dot', '·'),
    el('span', 'mine__stat', t('statAi', { v: num(row.raw.ai, 1) })),
    el('span', 'op__dot', '·'),
    el('span', 'mine__stat', t('statPoints', { v: num(row.raw.difficulty, 1) })),
    el('span', 'op__dot', '·'),
    el('span', null, t('statCriteria', { n: scored, total: row.criteria.length, weight: board.totalWeight }))
  );
  card.append(meta);

  if (!row.grandPrixEligible) {
    card.append(
      el('p', 'note note--warn', t('notEligible', { n: row.samples.ai, min: MIN_SAMPLE }))
    );
  }
  return card;
}

// ── The board ────────────────────────────────────────────────────────────
function renderBoard(board, mine) {
  const wrap = el('section', 'board');
  const head = el('div', 'board__head');
  head.append(el('span', null, t('boardHead', { n: board.total })), el('span', 'board__headScore', t('boardScore')));
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
      el('span', null, t('statClosed', { n: row.done })),
      el('span', 'op__dot', '·'),
      el('span', null, t('statAi', { v: num(row.raw.ai, 1) })),
      el('span', 'op__dot', '·'),
      el('span', null, t('statPoints', { v: num(row.raw.difficulty, 1) }))
    );
    if (!row.grandPrixEligible) {
      meta.append(el('span', 'op__dot', '·'), el('span', 'op__flag', t('sampleShort', { n: row.samples.ai })));
    }
    line.append(meta);

    line.addEventListener('click', () => {
      openId = isOpen ? null : row.id;
      repaint();
    });
    item.append(line);
    if (isOpen) item.append(isMine ? renderMyPanel(row) : renderCriteria(row));
    wrap.append(item);
  }
  return wrap;
}

// ── Tickets (the viewer's own only) ──────────────────────────────────────
function durationText(seconds) {
  if (!isNum(seconds) || seconds < 0) return null;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return t('minutesShort', { n: Math.max(1, mins) });
  return t('hoursShort', { n: Math.round((mins / 60) * 10) / 10 });
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
  if (dur) meta.append(el('span', 'op__dot', '·'), el('span', null, dur));

  // An icon AND a word, never colour alone.
  const slaKey = ticket.sla === 'hit' ? 'slaHit' : ticket.sla === 'miss' ? 'slaMiss' : 'slaNone';
  const slaClass = ticket.sla === 'hit' ? ' tk__sla--hit' : ticket.sla === 'miss' ? ' tk__sla--miss' : '';
  meta.append(el('span', 'op__dot', '·'), el('span', `tk__sla${slaClass}`, t(slaKey)));

  if (ticket.state && ticket.state !== 'closed') {
    meta.append(el('span', 'op__dot', '·'), el('span', 'tk__state', t(ticket.state === 'cancelled' ? 'stateCancelled' : 'stateOpen')));
  }
  li.append(meta);
  // The category gets its own line rather than a fourth inline item: a wrapped
  // flex row leaves its separator dangling at the end of the line above, and
  // these category names are long ("Маркетинг Акции/Кешбеки/Купоны/…").
  if (ticket.category) li.append(el('div', 'tk__cat', ticket.category));
  return li;
}

function renderTickets() {
  const wrap = el('div', 'tickets');
  if (!ticketEntry) {
    wrap.append(el('p', 'note', t('ticketsLoading')));
    return wrap;
  }
  if (!ticketEntry.tickets) {
    wrap.append(el('p', 'note note--bad', t('ticketsFailed', { error: ticketEntry.error || '' })));
    return wrap;
  }
  const all = ticketEntry.tickets;
  if (!all.length) {
    wrap.append(el('p', 'note', t('ticketsEmpty')));
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
    foot.append(el('span', 'note', t('ticketsShown', { n: visible, total })));
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
    wrap.append(el('p', 'note note--bad', t('staleData', { error: ticketEntry.error })));
  }
  return wrap;
}

// Your own open row carries tabs; everyone else's shows criteria alone.
function renderMyPanel(row) {
  const panel = el('div', 'panel-tabs');
  const tabs = el('div', 'tabs');
  for (const key of ['criteria', 'tickets']) {
    const b = el('button', 'tab', t(key === 'criteria' ? 'tabCriteria' : 'tabTickets'));
    b.type = 'button';
    b.setAttribute('aria-pressed', String(tab === key));
    b.addEventListener('click', () => {
      tab = key;
      shown = PAGE;
      repaint();
      if (key === 'tickets') loadTickets();
    });
    tabs.append(b);
  }
  panel.append(tabs, tab === 'tickets' ? renderTickets() : renderCriteria(row));
  return panel;
}

// ── Paint ────────────────────────────────────────────────────────────────
let lastEntry = null;

function paint(entry) {
  lastEntry = entry;
  const { from, to } = rangeFor(range);
  $('dash').href = `${String(settings.host).replace(/\/+$/, '')}/?from=${from}&to=${to}`;
  $('period').textContent = from === to ? from : `${from} → ${to}`;

  if (!entry?.summary) {
    $('body').replaceChildren(el('p', entry?.error ? 'note note--bad' : 'note', entry?.error || t('loading')));
    $('stamp').textContent = '';
    return;
  }

  const board = buildBoard(entry.summary, t.locale);
  const mine = findRow(board.rows, settings);
  if (openId === null && mine) openId = mine.id;

  const parts = [renderTiles(board.kpis)];
  if (mine) parts.push(renderMine(mine, board));
  else parts.push(renderPickPrompt());
  if (board.total) parts.push(renderBoard(board, mine));
  else parts.push(el('p', 'note', 'Nobody has a closed task on this range yet.'));
  if (entry.error) parts.push(el('p', 'note note--bad', t('staleData', { error: entry.error })));

  $('body').replaceChildren(...parts);
  $('stamp').textContent = stamp(entry.at);
}

// Not a gate — a one-line offer above a board that is already readable.
function renderPickPrompt() {
  const box = el('div', 'prompt');
  box.append(el('span', 'note', t('pickPrompt')));
  const btn = el('button', 'btn btn--primary btn--sm', t('pickAction'));
  btn.type = 'button';
  btn.addEventListener('click', () => chrome.runtime.openOptionsPage());
  box.append(btn);
  return box;
}

// Fetched by the worker, never here, so closing the popup mid-request cannot
// abort it — and painted from the cache first, like everything else.
async function loadTickets() {
  const cached = await chrome.storage.local.get(`tickets:${range}`);
  const entry = cached[`tickets:${range}`];
  if (entry && entry.operatorId === settings.operatorId && entry.from === rangeFor(range).from) {
    ticketEntry = entry;
    repaint();
  }
  try {
    ticketEntry = await chrome.runtime.sendMessage({ type: 'tickets', range });
  } catch (err) {
    ticketEntry = { tickets: null, error: String(err?.message || err) };
  }
  repaint();
}

function jumpToMyRow() {
  const row = document.querySelector('.op--mine');
  // jsdom has no scrollIntoView, and neither does a row that is not rendered.
  if (row && typeof row.scrollIntoView === 'function') {
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

const repaint = () => paint(lastEntry);

async function selectRange(next) {
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
}

async function refresh() {
  $('refresh').dataset.busy = '1';
  try {
    paint(await chrome.runtime.sendMessage({ type: 'refresh', range }));
  } catch (err) {
    paint({ error: String(err?.message || err) });
  } finally {
    delete $('refresh').dataset.busy;
  }
}

async function main() {
  settings = await loadSettings();
  t = makeT(resolveLocale(settings.locale));
  document.documentElement.lang = t.locale;
  $('refresh').setAttribute('aria-label', t('refresh'));
  $('settings').setAttribute('aria-label', t('settings'));
  $('dash').textContent = `${t('dashboard')} ↗`;
  range = RANGES.some((r) => r.key === settings.range) ? settings.range : 'today';
  renderRanges();
  paint(await readCache(range)); // instant, from the last background refresh
  $('refresh').addEventListener('click', refresh);
  $('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
  await refresh(); // then revalidate
}

main();
