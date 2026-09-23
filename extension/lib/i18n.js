// The extension's own message table, in the same three languages the
// dashboard speaks (src/i18n/index.jsx).
//
// Why its own and not chrome.i18n: chrome.i18n follows the BROWSER's UI
// language and cannot be switched inside the extension. The team runs Chrome
// in whatever language the machine shipped with and reads the dashboard in
// their own, so the language has to be a setting, exactly as it is on the
// dashboard. `auto` follows Chrome and is the default.
//
// The criterion labels are NOT here: they are generated from the dashboard's
// own leaderboard messages (see scripts/sync-extension.mjs), so the wording
// can never drift from the Rating view's.
//
// Terminology is lifted from the dashboard's messages rather than invented —
// «AI‑балл», «Закрыто», «Баллы», «Уникальные клиенты», «Обновить» and the rest
// already exist there, and two words for one thing across two screens is its
// own kind of bug.
import { METRIC_LABELS } from './metricLabels.js';

export const LOCALES = ['en', 'ru', 'uz'];
export const DEFAULT_LOCALE = 'en';
export const LOCALE_NAMES = { en: 'English', ru: 'Русский', uz: 'Oʻzbekcha' };
// BCP-47 tags for Intl (relative times, clock), matching src/i18n/index.jsx.
export const INTL_LOCALE = { en: 'en-GB', ru: 'ru-RU', uz: 'uz-Latn-UZ' };

const MESSAGES = {
  en: {
    loading: 'Loading…',
    refresh: 'Refresh',
    settings: 'Settings',
    dashboard: 'Dashboard',

    range_today: 'Today',
    range_week: 'Week',
    range_month: 'Month',

    tile_closed: 'Closed',
    tile_closedHint: 'of {n}',
    tile_sla: 'SLA',
    tile_slaHint: 'n {n}',
    tile_ai: 'AI score',
    tile_aiHint: 'n {n}',
    tile_customers: 'Customers',
    tile_customersHint: 'distinct',

    you: 'You',
    rankOf: 'of {n}',
    jumpToRow: 'Show your row, {rank} of {total}, in the list',
    perHundred: '/ 100',
    statClosed: '{n} closed',
    statAi: 'AI {v}',
    statPoints: '{v} pts',
    statCriteria: '{n} of {total} criteria, Σ {weight}',
    notEligible: 'Not in the prize running yet: {n} rated tasks, {min} needed.',

    boardHead: 'Everyone',
    boardScore: 'Score / 100',
    sampleShort: 'sample {n}',
    unnamed: 'Unnamed · {id}',
    emptyBoard: 'Nobody has a closed task on this range yet.',

    view_board: 'Board',
    view_tickets: 'My tickets',
    ticketsHead: 'My tickets',
    ticketsClosed: '{closed} closed',
    ticketsSla: 'SLA {hit} of {sla}',
    ticketsPick: 'Pick your name to see your own tickets here.',

    live: 'Live',
    liveAria: 'Live mode — today, updated every 30 seconds',
    liveFoot: 'Live, every 30 s',
    liveRangeHint: 'Live shows today only',
    ticketsLoading: 'Loading tickets…',
    ticketsEmpty: 'No tickets on this range.',
    ticketsFailed: 'Couldn’t load your tickets.',
    ticketsShown: 'Showing {n} of {total}',
    ticketsMore: 'Show more',
    ticketsAi: 'AI {v}',
    ticketsPoints: '{v} pts',
    slaHit: '✓ SLA',
    slaMiss: '✗ SLA',
    slaNone: 'SLA n/a',
    stateOpen: 'open',
    stateCancelled: 'cancelled',
    minutesShort: '{n} min',
    hoursShort: '{n} h',
    critScore: '{score}/100, worth {weight}',
    critNoData: 'no data on this range — weight redistributed',
    critSample: 'sample {n} < {min}',

    pickPrompt: 'Pick your name to pin your card here and put your score on the toolbar.',
    pickAction: 'Choose',
    // Failures, in plain words: what happened and what to do about it. The raw
    // exception never reaches the panel (see errorKind in lib/kpi.js).
    errBotCheck: '{host} is showing a bot check. Open the dashboard in a tab once, then press Refresh.',
    errBotCheckOptions: '{host} is showing a bot check. Open the dashboard in a tab once, then press Reload the list.',
    errNetwork: 'Couldn’t reach {host}.',
    errServer: '{host} couldn’t load this range.',
    errShowingFrom: 'Showing data from {time}; it retries on its own.',
    errRetries: 'It retries on its own.',
    retry: 'Retry',
    openDashboard: 'Open dashboard',
    justNow: 'just now',
    minutesAgo: '{n} min ago',
    updatedAt: 'Updated {time}',

    badgeNoName: 'KPI px — pick your name in the settings',
    badgeTitle: '{name}: #{rank} of {total}, score {score}',
    badgeSmallSample: 'small sample',

    optionsTitle: 'KPI px settings',
    fieldHost: 'Dashboard host',
    fieldHostHint: 'Where /api/summary lives. A host other than auo.uz asks for its own permission when you save.',
    fieldName: 'Your name',
    fieldNameHint: 'The list comes from the host above.',
    fieldLanguage: 'Language',
    fieldLanguageHint: 'Auto follows the browser’s language.',
    fieldBadge: 'Badge shows',
    fieldBadgeScore: 'Score — e.g. 64',
    fieldBadgeRank: 'Place — e.g. #2',
    fieldBadgeHint: 'Always today’s number, whatever range the popup is left on.',
    fieldRefresh: 'Refresh every',
    refresh_5: '5 minutes',
    refresh_15: '15 minutes',
    refresh_30: '30 minutes',
    refresh_60: '1 hour',
    fieldRefreshHint: 'Each refresh is one request for today’s range.',
    fieldTheme: 'Theme',
    fieldThemeHint: 'System follows your operating system.',
    theme_system: 'System',
    theme_light: 'Light',
    theme_dark: 'Dark',
    localeAuto: 'Auto',
    save: 'Save',
    reloadOperators: 'Reload the list',
    pickPlaceholder: '— pick your name —',
    loadingOperators: 'Loading operators…',
    loadFailed: '— could not load —',
    operatorsFound: 'Operators with tasks in the last 30 days: {n} ({from} → {to}).',
    operatorsFailed: 'Couldn’t load the operator list from {host}.',
    notRecently: '{name} (no tasks in the last 30 days)',
    saved: 'Saved — the badge updates in a moment.',
    badUrl: 'That is not a valid URL.',
    permissionDenied: 'Permission for that host was declined.',
  },

  ru: {
    loading: 'Загрузка…',
    refresh: 'Обновить',
    settings: 'Настройки',
    dashboard: 'Дашборд',

    range_today: 'Сегодня',
    range_week: 'Неделя',
    range_month: 'Месяц',

    tile_closed: 'Закрыто',
    tile_closedHint: 'из {n}',
    tile_sla: 'SLA',
    tile_slaHint: 'изм. {n}',
    tile_ai: 'AI‑балл',
    tile_aiHint: 'оц. {n}',
    tile_customers: 'Клиенты',
    tile_customersHint: 'уникальные',

    you: 'Вы',
    rankOf: 'из {n}',
    jumpToRow: 'Показать вашу строку, {rank} из {total}, в списке',
    perHundred: '/ 100',
    statClosed: 'закрыто: {n}',
    statAi: 'AI {v}',
    statPoints: '{v} б.',
    statCriteria: 'критериев: {n} из {total}, Σ {weight}',
    notEligible: 'Пока не в борьбе за приз: оценённых заявок {n}, нужно {min}.',

    boardHead: 'Все',
    boardScore: 'Балл / 100',
    sampleShort: 'выборка {n}',
    unnamed: 'Без имени · {id}',
    emptyBoard: 'За этот период ни у кого нет закрытых задач.',

    view_board: 'Рейтинг',
    view_tickets: 'Мои заявки',
    ticketsHead: 'Мои заявки',
    ticketsClosed: 'закрыто: {closed}',
    ticketsSla: 'SLA {hit} из {sla}',
    ticketsPick: 'Выберите своё имя, чтобы видеть здесь свои заявки.',

    live: 'Live',
    liveAria: 'Режим Live — сегодня, обновление каждые 30 секунд',
    liveFoot: 'Live, каждые 30 с',
    liveRangeHint: 'В режиме Live — только сегодня',
    ticketsLoading: 'Загрузка заявок…',
    ticketsEmpty: 'За этот период заявок нет.',
    ticketsFailed: 'Не удалось загрузить заявки.',
    ticketsShown: 'Показано {n} из {total}',
    ticketsMore: 'Показать ещё',
    ticketsAi: 'AI {v}',
    ticketsPoints: '{v} б.',
    slaHit: '✓ SLA',
    slaMiss: '✗ SLA',
    slaNone: 'SLA н/д',
    stateOpen: 'в работе',
    stateCancelled: 'отменена',
    minutesShort: '{n} мин',
    hoursShort: '{n} ч',
    critScore: '{score}/100, вес {weight}',
    critNoData: 'нет данных за период — вес перераспределён',
    critSample: 'выборка {n} < {min}',

    pickPrompt: 'Выберите своё имя, чтобы закрепить карточку здесь и вывести балл на значок.',
    pickAction: 'Выбрать',
    errBotCheck: '{host} показывает проверку на бота. Откройте дашборд во вкладке один раз, затем нажмите «Обновить».',
    errBotCheckOptions: '{host} показывает проверку на бота. Откройте дашборд во вкладке один раз, затем нажмите «Обновить список».',
    errNetwork: 'Не удалось связаться с {host}.',
    errServer: '{host} не смог загрузить этот период.',
    errShowingFrom: 'Показаны данные на {time}; попытка повторится сама.',
    errRetries: 'Попытка повторится сама.',
    retry: 'Повторить',
    openDashboard: 'Открыть дашборд',
    justNow: 'только что',
    minutesAgo: '{n} мин назад',
    updatedAt: 'Обновлено в {time}',

    badgeNoName: 'KPI px — выберите своё имя в настройках',
    badgeTitle: '{name}: #{rank} из {total}, балл {score}',
    badgeSmallSample: 'малая выборка',

    optionsTitle: 'Настройки KPI px',
    fieldHost: 'Хост дашборда',
    fieldHostHint: 'Где находится /api/summary. Для хоста, отличного от auo.uz, при сохранении запросится отдельное разрешение.',
    fieldName: 'Ваше имя',
    fieldNameHint: 'Список берётся с хоста выше.',
    fieldLanguage: 'Язык',
    fieldLanguageHint: '«Авто» следует языку браузера.',
    fieldBadge: 'На значке',
    fieldBadgeScore: 'Балл — например 64',
    fieldBadgeRank: 'Место — например #2',
    fieldBadgeHint: 'Всегда сегодняшнее число, какой бы период ни был открыт в окне.',
    fieldRefresh: 'Обновлять каждые',
    refresh_5: '5 минут',
    refresh_15: '15 минут',
    refresh_30: '30 минут',
    refresh_60: '1 час',
    fieldRefreshHint: 'Одно обновление — один запрос за сегодняшний период.',
    fieldTheme: 'Тема',
    fieldThemeHint: '«Системная» следует настройке операционной системы.',
    theme_system: 'Системная',
    theme_light: 'Светлая',
    theme_dark: 'Тёмная',
    localeAuto: 'Авто',
    save: 'Сохранить',
    reloadOperators: 'Обновить список',
    pickPlaceholder: '— выберите своё имя —',
    loadingOperators: 'Загрузка операторов…',
    loadFailed: '— не удалось загрузить —',
    operatorsFound: 'Операторов с задачами за последние 30 дней: {n} ({from} → {to}).',
    operatorsFailed: 'Не удалось загрузить список операторов с {host}.',
    notRecently: '{name} (нет задач за последние 30 дней)',
    saved: 'Сохранено — значок обновится через мгновение.',
    badUrl: 'Это не похоже на корректный URL.',
    permissionDenied: 'В доступе к этому хосту отказано.',
  },

  uz: {
    loading: 'Yuklanmoqda…',
    refresh: 'Yangilash',
    settings: 'Sozlamalar',
    dashboard: 'Panel',

    range_today: 'Bugun',
    range_week: 'Hafta',
    range_month: 'Oy',

    tile_closed: 'Yopilgan',
    tile_closedHint: '{n} tadan',
    tile_sla: 'SLA',
    tile_slaHint: 'oʻlch. {n}',
    tile_ai: 'AI ball',
    tile_aiHint: 'bahol. {n}',
    tile_customers: 'Mijozlar',
    tile_customersHint: 'noyob',

    you: 'Siz',
    rankOf: '{n} tadan',
    jumpToRow: 'Roʻyxatda oʻz qatoringizni koʻrsatish, {total} tadan {rank}',
    perHundred: '/ 100',
    statClosed: '{n} yopilgan',
    statAi: 'AI {v}',
    statPoints: '{v} ball',
    statCriteria: '{total} mezondan {n} tasi, Σ {weight}',
    notEligible: 'Hali sovrin uchun kurashda emas: {n} ta baholangan vazifa, {min} ta kerak.',

    boardHead: 'Hammasi',
    boardScore: 'Ball / 100',
    sampleShort: 'tanlanma {n}',
    unnamed: 'Nomsiz · {id}',
    emptyBoard: 'Bu davrda hech kimda yopilgan vazifa yoʻq.',

    view_board: 'Reyting',
    view_tickets: 'Mening arizalarim',
    ticketsHead: 'Mening arizalarim',
    ticketsClosed: '{closed} yopilgan',
    ticketsSla: 'SLA {hit} / {sla}',
    ticketsPick: 'Oʻz arizalaringizni koʻrish uchun ismingizni tanlang.',

    live: 'Jonli',
    liveAria: 'Jonli rejim — bugun, har 30 soniyada yangilanadi',
    liveFoot: 'Jonli, har 30 s',
    liveRangeHint: 'Jonli rejim faqat bugunni koʻrsatadi',
    ticketsLoading: 'Arizalar yuklanmoqda…',
    ticketsEmpty: 'Bu davrda ariza yoʻq.',
    ticketsFailed: 'Arizalarni yuklab boʻlmadi.',
    ticketsShown: '{total} tadan {n} tasi koʻrsatilgan',
    ticketsMore: 'Yana koʻrsatish',
    ticketsAi: 'AI {v}',
    ticketsPoints: '{v} ball',
    slaHit: '✓ SLA',
    slaMiss: '✗ SLA',
    slaNone: 'SLA yoʻq',
    stateOpen: 'ishda',
    stateCancelled: 'bekor qilingan',
    minutesShort: '{n} daq',
    hoursShort: '{n} soat',
    critScore: '{score}/100, vazni {weight}',
    critNoData: 'bu davrda maʼlumot yoʻq — vazn qayta taqsimlandi',
    critSample: 'tanlanma {n} < {min}',

    pickPrompt: 'Kartangiz shu yerda turishi va ballingiz belgida koʻrinishi uchun ismingizni tanlang.',
    pickAction: 'Tanlash',
    errBotCheck: '{host} bot tekshiruvini koʻrsatmoqda. Panelni bir marta varaqda oching, soʻng «Yangilash»ni bosing.',
    errBotCheckOptions: '{host} bot tekshiruvini koʻrsatmoqda. Panelni bir marta varaqda oching, soʻng «Roʻyxatni yangilash»ni bosing.',
    errNetwork: '{host} bilan bogʻlanib boʻlmadi.',
    errServer: '{host} bu davrni yuklay olmadi.',
    errShowingFrom: '{time} holatidagi maʼlumot koʻrsatilmoqda; qayta urinish avtomatik.',
    errRetries: 'Qayta urinish avtomatik.',
    retry: 'Qayta urinish',
    openDashboard: 'Panelni ochish',
    justNow: 'hozirgina',
    minutesAgo: '{n} daqiqa oldin',
    updatedAt: 'Yangilangan: {time}',

    badgeNoName: 'KPI px — sozlamalarda ismingizni tanlang',
    badgeTitle: '{name}: {total} tadan #{rank}, ball {score}',
    badgeSmallSample: 'kichik tanlanma',

    optionsTitle: 'KPI px sozlamalari',
    fieldHost: 'Panel xosti',
    fieldHostHint: '/api/summary shu yerda. auo.uz dan boshqa xost saqlashda alohida ruxsat soʻraydi.',
    fieldName: 'Ismingiz',
    fieldNameHint: 'Roʻyxat yuqoridagi xostdan olinadi.',
    fieldLanguage: 'Til',
    fieldLanguageHint: '«Avto» brauzer tiliga ergashadi.',
    fieldBadge: 'Belgida',
    fieldBadgeScore: 'Ball — masalan 64',
    fieldBadgeRank: 'Oʻrin — masalan #2',
    fieldBadgeHint: 'Oynada qaysi davr ochiq boʻlishidan qatʼi nazar, doim bugungi raqam.',
    fieldRefresh: 'Yangilash oraligʻi',
    refresh_5: '5 daqiqa',
    refresh_15: '15 daqiqa',
    refresh_30: '30 daqiqa',
    refresh_60: '1 soat',
    fieldRefreshHint: 'Har yangilash — bugungi davr uchun bitta soʻrov.',
    fieldTheme: 'Mavzu',
    fieldThemeHint: '«Tizim» operatsion tizim sozlamasiga ergashadi.',
    theme_system: 'Tizim',
    theme_light: 'Yorugʻ',
    theme_dark: 'Qorongʻi',
    localeAuto: 'Avto',
    save: 'Saqlash',
    reloadOperators: 'Roʻyxatni yangilash',
    pickPlaceholder: '— ismingizni tanlang —',
    loadingOperators: 'Operatorlar yuklanmoqda…',
    loadFailed: '— yuklab boʻlmadi —',
    operatorsFound: 'Soʻnggi 30 kunda vazifasi boʻlgan operatorlar: {n} ({from} → {to}).',
    operatorsFailed: '{host} dan operatorlar roʻyxatini yuklab boʻlmadi.',
    notRecently: '{name} (soʻnggi 30 kunda vazifa yoʻq)',
    saved: 'Saqlandi — belgi bir lahzada yangilanadi.',
    badUrl: 'Bu toʻgʻri URL emas.',
    permissionDenied: 'Bu xostga ruxsat berilmadi.',
  },
};

export { MESSAGES };

// 'auto' (the default) follows Chrome's UI language; anything else is the
// user's explicit choice and wins over the browser.
export function resolveLocale(setting) {
  if (LOCALES.includes(setting)) return setting;
  const ui =
    (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage?.()) ||
    (typeof navigator !== 'undefined' && navigator.language) ||
    '';
  const base = String(ui).toLowerCase().split('-')[0];
  return LOCALES.includes(base) ? base : DEFAULT_LOCALE;
}

const interpolate = (str, vars) =>
  vars ? str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k]))) : str;

// A missing key falls back to English rather than printing the key: a half
// translated panel is usable, `boardHead` in the middle of a row is not.
export function makeT(locale) {
  const lc = LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  const t = (key, vars) => {
    const raw = MESSAGES[lc]?.[key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key;
    return interpolate(raw, vars);
  };
  t.locale = lc;
  t.intl = INTL_LOCALE[lc] || INTL_LOCALE[DEFAULT_LOCALE];
  // The criterion labels, from the dashboard's own table.
  t.metric = (key) => METRIC_LABELS[lc]?.[key] ?? METRIC_LABELS[DEFAULT_LOCALE]?.[key] ?? key;
  return t;
}

// Relative minutes are formatted from the message table, NOT from
// Intl.RelativeTimeFormat.
//
// Intl looked like the right answer — it carries each language's plural rules,
// so «2 минуты» and «5 минут» come out right with no table here. It is not
// usable: Chrome's ICU reports `uz` as supported (supportedLocalesOf lists it,
// resolvedOptions().locale returns "uz") and then formats with the ROOT
// patterns anyway, so the popup showed "-4 min" in Uzbek while the same call
// in Node, with full ICU, returned "4 daqiqa oldin". A wrong string that the
// engine insists is right cannot be detected, so the three wordings are
// written out instead — deliberately plural-free ("{n} мин назад", not
// "{n} минут назад"), which is correct at every count in all three.
//
// Clock times are still Intl's: toLocaleTimeString carries broad data and was
// verified in Chrome for all three tags.
