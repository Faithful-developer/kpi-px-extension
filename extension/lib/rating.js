// ─────────────────────────────────────────────────────────────────────────
// GENERATED FILE — do not edit. Written by scripts/sync-extension.mjs from
// src/utils/rating.js. Run `npm run ext:sync` after changing the source.
// ─────────────────────────────────────────────────────────────────────────
// Operator leaderboard scoring — the weighted formula behind the 🏆 Rating view.
//
// The criteria set (fixed by the user on 2026-08-11):
//
//   Completeness   10   quality   higher = better   conversation friction index (burden + hang), deterministic
//   Closed         10   volume    higher = better   in-range conversations assigned to the operator (ox-chat assignedToUser) with status === 'closed' only (archived excluded)
//   SLA ≤10m       10   quality   higher = better   share of conversations resolved within 10 work minutes of creation
//   CRM companies  10   CRM       higher = better   distinct companies from the manual CRM ticket import
//   UNQ companies  10   CRM       higher = better   distinct companies worked with (chats)
//   Difficulty     50   mix       higher = better   how hard the operator's conversation mix is
//
// Deleted permanently: **Resolution time** (median minutes, inverted, 2026-08-08),
// the old **Quantity** (CRM-linked created tickets, 2026-08-08 — today's Closed
// criterion counts in-range conversations assigned to the operator via
// ox-chat's assignedToUser, status === 'closed' only, archived excluded,
// instead) and **Quality** (solve rate,
// 2026-08-11). The June regression in rating.test.js still scores the deleted
// metrics — from its own self-contained historical metric definitions — because
// that replay is the only proof this ENGINE matches the published June sheet.
// The engine therefore stays generic over any metric list; only THIS list is
// the product.
//
// Method: each metric is min→0 / max→100 normalized across operators (`invert`
// flips it); normalized values × weights, summed, ÷ total weight → 0..100.
//
// Fairness (Методология → «Обработка неполных данных»): a metric that carries a
// `sample` function is gated per operator — fewer than MIN_SAMPLE underlying
// records → neutral 50 in strict mode, and a `<key>-small-sample` flag in both
// modes. Gates are PER METRIC because they hold for different operators
// (Shaxzod Karimov: 259 closed tickets — a fine AI sample — but only 1 with a
// «Завершено» date, which is why one shared gate mispriced the June winner).

export const MIN_SAMPLE = 10;

function firstNum(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

export const METRICS = [
  {
    key: 'ai',
    label: 'Completeness',
    weight: 10,
    role: 'quality',
    invert: false,
    quality: true,
    getter: (o) => firstNum(o, ['ai']),
    // Sample size for Completeness, a deterministic conversation-friction
    // index (not an evaluator score); closed count stands in as a proxy for
    // how many chats it reflects until the backend sends `aiRated`.
    sample: (o) => firstNum(o, ['aiRated', 'ratedTickets', 'done']),
  },
  // Closed — the quantity criterion: in-range conversations formally assigned
  // to the operator (ox-chat's own `assignedToUser`, from /chat/conversations —
  // a conversation is one support case, not the whole chat channel) with
  // status === 'closed' ONLY. `archived` is deliberately excluded: a
  // 2026-08-14 product-owner decision (superseding
  // docs/ox-chat-conversations-addendum.md §1's original "closed or archived"
  // definition) after the probe found archived means closed-without-resolution
  // (312/312 sampled archived conversations had no `closedAt` and no
  // `conclusion`) — counting them would reward abandoning a case. Counted at
  // face value and deliberately ungated (user's call, 2026-08-11): the count
  // IS the value, a small count is just a low score, there is nothing to
  // verify.
  {
    key: 'quantity',
    label: 'Closed',
    weight: 10,
    role: 'volume',
    invert: false,
    quality: false,
    getter: (o) => firstNum(o, ['done']),
  },
  // SLA ≤10m — `slaResolvedPct`: share of the operator's assigned
  // conversations where closedAt − createdAt <= 10 WORK minutes (09:00–23:00
  // clock, via workMinutesBetween). This measures resolved-fast (throughput),
  // NOT replied-fast/first-response — a 2026-08-14 product-owner decision
  // restored the originally documented prize rule ("created and solved within
  // 10 minutes"); see docs/ox-chat-conversations-addendum.md §2. The two
  // reward different operator behaviour, so do not treat them as
  // interchangeable. Conversations with no `closedAt` are excluded from the
  // denominator entirely (not counted as misses); the value is null, never 0,
  // when nothing is measurable. Getter order is a deliberate fallback ladder:
  // `slaResolvedPct` (this conversation-scoped figure) → `slaPct` (LEGACY
  // chat-scoped first-response %, still merged client-side from
  // /api/chat-sla — a genuinely different measurement) →
  // `exportResolvedUnderSlaPct`.
  {
    key: 'speed',
    label: 'SLA ≤10m',
    weight: 10,
    role: 'quality',
    invert: false,
    quality: true,
    getter: (o) => firstNum(o, ['slaResolvedPct', 'slaPct', 'exportResolvedUnderSlaPct']),
    sample: (o) => firstNum(o, ['exportSlaSample', 'slaSample', 'closedWithDate', 'done']),
  },
  // CRM companies — distinct companies on tickets the OPERATOR CREATED.
  // Sourced from the manual CRM ticket export (utils/crmExport.js maps the
  // export's per-creator company set onto `companiesCreated`) — there is no
  // API source for this criterion.
  // Label kept short (user, 2026-08-11): the full wording cost too much width
  // in the ranking table's header row. The column tooltip carries the meaning.
  {
    key: 'companiesCreated',
    label: 'CRM companies',
    weight: 10,
    role: 'crm',
    invert: false,
    quality: false,
    getter: (o) => firstNum(o, ['companiesCreated']),
  },
  // UNQ companies — distinct companies the operator took part in CHATS with
  // (ox-chat, credited to every participant, duplicates removed).
  {
    key: 'crmReach',
    label: 'UNQ companies',
    weight: 10,
    role: 'crm',
    invert: false,
    quality: false,
    getter: (o) => firstNum(o, ['crmReach', 'uniqueCompanies', 'companies']),
  },
  // Difficulty — the operator's conversation difficulty index, computed
  // server-side from ox-chat effort proxies (message volume, back-and-forth
  // turns, work-clock duration capped at one shift, number of operators
  // involved) and delivered as `difficultyIndex`. Carries half the score by
  // the user's instruction.
  {
    key: 'difficulty',
    label: 'Difficulty',
    weight: 50,
    role: 'mix',
    invert: false,
    quality: false,
    getter: (o) => firstNum(o, ['difficultyIndex']),
  },
];

export const DEFAULT_WEIGHTS = METRICS.reduce((a, m) => ({ ...a, [m.key]: m.weight }), {});

function normalize(values, { invert = false } = {}) {
  const valid = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (valid.length === 0) return values.map(() => 50);
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  return values.map((v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 50;
    if (max === min) return 50;
    const t = (v - min) / (max - min);
    return (invert ? 1 - t : t) * 100;
  });
}

// Which metrics actually have per-operator data in this dataset.
export function availableMetrics(operators, metrics = METRICS) {
  const avail = {};
  metrics.forEach((m) => {
    avail[m.key] = operators.some((o) => m.getter(o) !== null);
  });
  return avail;
}

// options.strict: when true, follow the methodology to the letter — missing
// metrics and small-sample quality metrics are neutralized to 50 and keep their
// full weight (the exact "prize" computation). When false (default), score only
// on metrics that actually have data (their weights are redistributed) and rank
// every operator by their real values. The ≥10-sample flags are kept either way.
// options.metrics: override the criteria set. The live app never passes it; the
// June regression does, to replay the sheet's original five criteria.
export function computeLeaderboard(operators, weights = DEFAULT_WEIGHTS, options = {}) {
  const { strict = false, metrics = METRICS } = options;
  // Population filter (2026-08-14 product-owner decision, Open Question 6,
  // default = exclude): `scored: false` marks a conversation-assignee whose
  // assignedToUser.role is admin/owner, not operator — they are not the
  // population being rated and must not touch the leaderboard at all. Only an
  // explicit `false` excludes; missing/null/undefined stays IN (older
  // payloads, mocks, and client-merged rows must never be silently dropped).
  // This has to happen before `available`/`raw`/`normalize` are built, not
  // just filtered out of the final rows — otherwise an outlier admin/owner
  // value would still stretch the min→max normalization range and distort
  // every real operator's score.
  operators = (operators || []).filter((o) => o?.scored !== false);
  if (operators.length === 0) {
    return { rows: [], available: availableMetrics([], metrics), totalWeight: 0, strict };
  }
  // availableMetrics reports which metrics have any data — it must see the
  // same (filtered) population that is actually being scored, otherwise a
  // metric that only an excluded admin/owner has data for would misreport as
  // "available" for the operators the app renders it against.
  const available = availableMetrics(operators, metrics);

  // Reliability gate, evaluated per gated metric rather than once per operator.
  const gated = metrics.filter((m) => typeof m.sample === 'function');
  const sampleOf = (m, o) => {
    const n = m.sample(o);
    return n === null || n === undefined ? 0 : n;
  };
  const reliable = operators.map((o) =>
    Object.fromEntries(gated.map((m) => [m.key, sampleOf(m, o) >= MIN_SAMPLE]))
  );

  // Effective weight per metric: in non-strict mode, unavailable metrics drop
  // to 0 (redistributed) instead of contributing a flat neutral 50.
  const effWeight = {};
  metrics.forEach((m) => {
    const w = Number(weights[m.key]) || 0;
    effWeight[m.key] = !strict && !available[m.key] ? 0 : w;
  });
  const totalWeight = metrics.reduce((s, m) => s + effWeight[m.key], 0) || 1;

  // Per-metric normalized arrays.
  const norms = {};
  metrics.forEach((m) => {
    if (!available[m.key]) {
      norms[m.key] = operators.map(() => 50); // weight is 0 in non-strict
      return;
    }
    const raw = operators.map((o, i) => {
      const v = m.getter(o);
      if (strict && m.quality && reliable[i][m.key] === false) return null; // neutralize only in strict
      return v;
    });
    norms[m.key] = normalize(raw, { invert: m.invert });
  });

  const rows = operators.map((op, i) => {
    const scores = {};
    let weighted = 0;
    metrics.forEach((m) => {
      const n = norms[m.key][i];
      scores[m.key] = n;
      weighted += n * effWeight[m.key];
    });

    const samples = Object.fromEntries(gated.map((m) => [m.key, sampleOf(m, op)]));

    // «Гран-при: претендуют только сотрудники с реальной выборкой качества
    // (≥10 оценённых заявок)» — the AI sample is the gate, not the others.
    const grandPrixEligible = reliable[i].ai !== false;

    const flags = [];
    gated.forEach((m) => {
      if (reliable[i][m.key]) return;
      // AI is flagged unconditionally (it decides grand-prix eligibility);
      // other gates only matter where the metric has data at all.
      if (m.key === 'ai' || available[m.key]) flags.push(`${m.key}-small-sample`);
    });

    // Raw per-metric values (for display, like the source spreadsheet).
    const raw = {};
    metrics.forEach((m) => {
      raw[m.key] = available[m.key] ? m.getter(op) : null;
    });
    // CRM nomination: real CRM output but no reliable quality sample. Signal =
    // linked tickets when present (June replay: `crmVolume`), else companies
    // created, else companies reached.
    const crmSignal = firstNum(raw, ['crmVolume', 'companiesCreated', 'crmReach']);
    const hasCrm =
      (available.crmVolume || available.companiesCreated || available.crmReach) &&
      crmSignal !== null &&
      crmSignal > 0;
    return {
      id: op.id,
      name: op.name,
      sample: samples.ai ?? 0,
      samples,
      reliable: reliable[i],
      assigned: op.assigned,
      done: op.done,
      raw,
      scores,
      final: Math.round((weighted / totalWeight) * 10) / 10,
      grandPrixEligible,
      crmNomination: !grandPrixEligible && hasCrm,
      flags,
    };
  });

  rows.sort((a, b) => b.final - a.final);
  rows.forEach((r, idx) => {
    r.rank = idx + 1;
  });

  return { rows, available, totalWeight, strict };
}
