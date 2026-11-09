export interface AppPreferences {
  pageSize: 'A4' | 'Letter';
  mathAlignment: 'left' | 'center';
  mathScale: number;
  lineSpacing: number;
  paragraphSpacing: number;
  bulletLineSpacing: number;
  bulletSpacing: number;
}

const key = 'apetek.preferences.v2';
const legacyKey = 'apetek.preferences.v1';
const defaults: AppPreferences = { pageSize: 'Letter', mathAlignment: 'left', mathScale: 100, lineSpacing: 1, paragraphSpacing: 13, bulletLineSpacing: 1, bulletSpacing: 8 };
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): PreferenceStorage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

function validate(value: unknown): AppPreferences {
  const stored = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  return {
    pageSize: stored.pageSize === 'A4' || stored.pageSize === 'Letter' ? stored.pageSize : defaults.pageSize,
    mathAlignment: stored.mathAlignment === 'left' || stored.mathAlignment === 'center' ? stored.mathAlignment : defaults.mathAlignment,
    mathScale: typeof stored.mathScale === 'number' && Number.isInteger(stored.mathScale) && stored.mathScale >= 50 && stored.mathScale <= 200
      ? stored.mathScale : defaults.mathScale,
    lineSpacing: typeof stored.lineSpacing === 'number' && Number.isFinite(stored.lineSpacing) && stored.lineSpacing >= 1 && stored.lineSpacing <= 3
      ? stored.lineSpacing : defaults.lineSpacing,
    paragraphSpacing: typeof stored.paragraphSpacing === 'number' && Number.isFinite(stored.paragraphSpacing) && stored.paragraphSpacing >= 0 && stored.paragraphSpacing <= 40
      ? stored.paragraphSpacing : defaults.paragraphSpacing,
    bulletLineSpacing: typeof stored.bulletLineSpacing === 'number' && Number.isFinite(stored.bulletLineSpacing) && stored.bulletLineSpacing >= 1 && stored.bulletLineSpacing <= 3
      ? stored.bulletLineSpacing : defaults.bulletLineSpacing,
    bulletSpacing: typeof stored.bulletSpacing === 'number' && Number.isFinite(stored.bulletSpacing) && stored.bulletSpacing >= 0 && stored.bulletSpacing <= 40
      ? stored.bulletSpacing : defaults.bulletSpacing,
  };
}

export function loadPreferences(storage = browserStorage()): AppPreferences {
  try {
    const raw = storage?.getItem(key);
    if (raw !== null && raw !== undefined) return validate(JSON.parse(raw));
    const legacy = storage?.getItem(legacyKey);
    if (legacy) {
      const old = JSON.parse(legacy) as Record<string, unknown>;
      const migrated = validate({ ...old, mathScale: typeof old?.mathScale === 'number' && Number.isFinite(old.mathScale)
        ? Math.min(200, Math.max(50, Math.round(old.mathScale / 0.75))) : 100, lineSpacing: 1, paragraphSpacing: 13, bulletLineSpacing: 1, bulletSpacing: 8 });
      try { storage?.setItem(key, JSON.stringify(migrated)); storage?.removeItem(legacyKey); } catch { /* Keep legacy preferences if storage is unavailable. */ }
      return migrated;
    }
  } catch {
    savePreferences(defaults, storage);
  }
  return { ...defaults };
}

export function savePreferences(preferences: AppPreferences, storage = browserStorage()): void {
  try { storage?.setItem(key, JSON.stringify(validate(preferences))); } catch { /* Preferences remain active for this session. */ }
}
