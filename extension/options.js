// Settings. The operator picker is filled from the host's own payload rather
// than a typed name, so the id is stored and the card survives a rename.
import { DEFAULTS, loadSettings, saveSettings, rosterRange, fetchSummary, operatorChoices } from './lib/kpi.js';
import { LOCALES, LOCALE_NAMES, makeT, resolveLocale } from './lib/i18n.js';

const $ = (id) => document.getElementById(id);

let t = makeT('en');

// Every visible string carries data-i18n; the English in the markup is the
// fallback a broken message table degrades to, not the source of truth.
function applyStaticText() {
  document.documentElement.lang = t.locale;
  document.title = t('optionsTitle');
  for (const node of document.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
}

function say(text, tone = '') {
  $('status').className = `note${tone ? ` note--${tone}` : ''}`;
  $('status').textContent = text;
}

const normalizeHost = (value) => String(value || DEFAULTS.host).trim().replace(/\/+$/, '');

// A host other than the one in host_permissions needs the user's consent, and
// Chrome only grants it from a user gesture — which is why this runs on Save
// and not while typing.
async function ensurePermission(host) {
  const origin = `${new URL(host).origin}/*`;
  if (await chrome.permissions.contains({ origins: [origin] })) return true;
  return chrome.permissions.request({ origins: [origin] });
}

async function fillOperators(host, selectedId, selectedName) {
  // 30 days, not today — see rosterRange(). Today's payload holds only the
  // people who already had a task today.
  const { from, to } = rosterRange();
  $('operator').replaceChildren(new Option(t('loadingOperators'), ''));
  try {
    const summary = await fetchSummary({ host, from, to });
    const choices = operatorChoices(summary);
    const options = [new Option(t('pickPlaceholder'), '')];
    for (const o of choices) {
      const opt = new Option(o.name, String(o.id));
      opt.dataset.name = o.name;
      opt.selected = String(o.id) === String(selectedId) || o.name === selectedName;
      options.push(opt);
    }
    // A name that is stored but absent even from 30 days of data (long leave, a
    // leaver, a renamed account) must still show as the current selection
    // instead of silently resetting to "pick your name".
    if (selectedName && !choices.some((o) => o.name === selectedName)) {
      const opt = new Option(t('notRecently', { name: selectedName }), String(selectedId ?? ''));
      opt.dataset.name = selectedName;
      opt.selected = true;
      options.push(opt);
    }
    $('operator').replaceChildren(...options);
    $('operatorHint').textContent = t('operatorsFound', { n: choices.length, from, to });
  } catch (err) {
    $('operator').replaceChildren(new Option(t('loadFailed'), ''));
    $('operatorHint').textContent = t('operatorsFailed', { host, error: err.message });
  }
}

async function main() {
  const cfg = await loadSettings();
  t = makeT(resolveLocale(cfg.locale));
  $('locale').replaceChildren(
    new Option(t('localeAuto'), 'auto'),
    // Language names are written in their OWN language, never translated —
    // somebody looking for their language must recognise it from any state.
    ...LOCALES.map((code) => new Option(LOCALE_NAMES[code], code))
  );
  $('locale').value = LOCALES.includes(cfg.locale) ? cfg.locale : 'auto';
  applyStaticText();
  $('host').value = cfg.host;
  $('badge').value = cfg.badge;
  $('refreshMinutes').value = String(cfg.refreshMinutes);
  await fillOperators(cfg.host, cfg.operatorId, cfg.operatorName);

  $('locale').addEventListener('change', () => {
    t = makeT(resolveLocale($('locale').value));
    applyStaticText();
    fillOperators(normalizeHost($('host').value), $('operator').value, '');
  });

  $('reload').addEventListener('click', async () => {
    const host = normalizeHost($('host').value);
    if (!(await ensurePermission(host))) return say(t('permissionDenied'), 'bad');
    await fillOperators(host, $('operator').value, '');
  });

  $('save').addEventListener('click', async () => {
    const host = normalizeHost($('host').value);
    try {
      new URL(host);
    } catch {
      return say(t('badUrl'), 'bad');
    }
    if (!(await ensurePermission(host))) return say(t('permissionDenied'), 'bad');
    const picked = $('operator').selectedOptions[0];
    await saveSettings({
      locale: $('locale').value,
      host,
      operatorId: $('operator').value ? Number($('operator').value) : null,
      operatorName: picked && $('operator').value ? (picked.dataset.name ?? picked.text) : '',
      badge: $('badge').value,
      refreshMinutes: Number($('refreshMinutes').value),
    });
    say(t('saved'), 'ok');
    return undefined;
  });
}

main();
