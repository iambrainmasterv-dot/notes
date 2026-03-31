const KEY = 'notetasks.androidNotifSettings.v1';

export type AndroidNotifUserSettings = {
  /** Master switch for Android local notifications (deadlines, digest, pins still respect this). */
  masterEnabled: boolean;
  digestEnabled: boolean;
  /** Local time HH:mm */
  digestTime: string;
  /** ~2h summary when due-today / daily / tomorrow templates exist (quiet 22:00–08:00). */
  periodicDigestEnabled: boolean;
};

const defaults: AndroidNotifUserSettings = {
  masterEnabled: true,
  digestEnabled: false,
  digestTime: '08:00',
  periodicDigestEnabled: true,
};

export function loadAndroidNotifSettings(): AndroidNotifUserSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults };
    const p = JSON.parse(raw) as Partial<AndroidNotifUserSettings>;
    return {
      masterEnabled: p.masterEnabled !== false,
      digestEnabled: p.digestEnabled === true,
      digestTime: typeof p.digestTime === 'string' && /^\d{1,2}:\d{2}$/.test(p.digestTime) ? p.digestTime : defaults.digestTime,
      periodicDigestEnabled: p.periodicDigestEnabled !== false,
    };
  } catch {
    return { ...defaults };
  }
}

export function saveAndroidNotifSettings(next: AndroidNotifUserSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function mergeAndroidNotifSettings(
  patch: Partial<AndroidNotifUserSettings>,
  base?: AndroidNotifUserSettings,
): AndroidNotifUserSettings {
  const prev = base ?? loadAndroidNotifSettings();
  const merged = { ...prev, ...patch };
  saveAndroidNotifSettings(merged);
  return merged;
}
