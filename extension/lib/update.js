// "A newer version is out" — for a team that installs the extension unpacked
// from a GitHub Releases zip, which Chrome never updates on its own.
//
// The source of truth is the PUBLIC repo's own manifest (Faithful-developer/
// kpi-px-extension), read from raw.githubusercontent.com — deliberately not
// the releases API. The API allows 60 unauthenticated calls an hour per IP,
// and the whole office sits behind one IP: it was already exhausted the day
// this was written. raw.githubusercontent.com has no such budget, answers
// with `Access-Control-Allow-Origin: *` (so no host permission is needed),
// and the CDN caches it for 5 minutes.
//
// The release routine pushes the manifest and cuts the release together, so
// the manifest's version is the one the Download link below will serve.

export const LATEST_MANIFEST_URL =
  'https://raw.githubusercontent.com/Faithful-developer/kpi-px-extension/main/extension/manifest.json';
export const RELEASES_URL = 'https://github.com/Faithful-developer/kpi-px-extension/releases/latest';

export const UPDATE_KEY = 'update';
// Releases come days apart; four checks a day is plenty and costs nothing.
export const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

// Dotted numeric versions, the only shape Chrome accepts in a manifest.
// Missing parts count as 0, so 1.3 === 1.3.0. Returns <0, 0 or >0.
export function compareVersions(a, b) {
  const pa = String(a || '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b || '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

// The version to announce, or null when the installed one is current (or
// newer — a dev build loaded unpacked ahead of the release).
export function newerVersion(entry, installed) {
  const latest = entry?.latest;
  return latest && compareVersions(latest, installed) > 0 ? latest : null;
}

export async function fetchLatestVersion({ signal } = {}) {
  const res = await fetch(LATEST_MANIFEST_URL, { credentials: 'omit', cache: 'no-store', signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  const version = typeof body?.version === 'string' ? body.version.trim() : '';
  if (!/^\d+(\.\d+){0,3}$/.test(version)) throw new Error('no version in the published manifest');
  return version;
}
