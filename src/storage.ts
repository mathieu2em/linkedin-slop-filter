/**
 * Lecture et ecriture typees des reglages, dans `chrome.storage.sync`.
 *
 * Les clefs sont stockees a plat (`enabled`, `threshold`, `allowedAuthors`) pour
 * que `chrome.storage.onChanged` les rapporte individuellement. Ne pas les
 * renommer: c'est un contrat.
 */

export type Settings = {
  enabled: boolean;
  threshold: number;
  allowedAuthors: string[];
};

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  threshold: 50,
  allowedAuthors: [],
};

export const SETTINGS_KEYS = ['enabled', 'threshold', 'allowedAuthors'] as const;

const MIN_THRESHOLD = 0;
const MAX_THRESHOLD = 100;

function debug(...args: unknown[]): void {
  console.debug('[slop-filter]', ...args);
}

/** Le storage peut contenir n'importe quoi: on valide au lieu de caster. */
export function parseSettings(raw: Record<string, unknown>): Settings {
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_SETTINGS.enabled;

  const threshold =
    typeof raw.threshold === 'number' && Number.isFinite(raw.threshold)
      ? Math.min(Math.max(Math.round(raw.threshold), MIN_THRESHOLD), MAX_THRESHOLD)
      : DEFAULT_SETTINGS.threshold;

  const allowedAuthors = Array.isArray(raw.allowedAuthors)
    ? raw.allowedAuthors.filter((a): a is string => typeof a === 'string')
    : DEFAULT_SETTINGS.allowedAuthors;

  return { enabled, threshold, allowedAuthors };
}

export async function readSettings(): Promise<Settings> {
  try {
    return parseSettings(await chrome.storage.sync.get([...SETTINGS_KEYS]));
  } catch (error) {
    debug('lecture des réglages impossible, on garde les défauts', error);
    return DEFAULT_SETTINGS;
  }
}

export async function writeSettings(patch: Partial<Settings>): Promise<void> {
  try {
    await chrome.storage.sync.set(patch);
  } catch (error) {
    debug('écriture des réglages impossible', error);
  }
}
