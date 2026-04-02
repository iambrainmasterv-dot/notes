const VOLUME_KEY = 'notetasks.soundVolumePct';
const MUTE_KEY = 'notetasks.soundMuted';

export function loadSoundMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveSoundMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** 0–1 linear gain (default 1). */
export function loadSoundVolume01(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw == null) return 1;
    const n = Number(raw);
    if (!Number.isFinite(n)) return 1;
    return Math.max(0, Math.min(1, n / 100));
  } catch {
    return 1;
  }
}

/** 0–100 for UI sliders. */
export function loadSoundVolumePercent(): number {
  return Math.round(loadSoundVolume01() * 100);
}

export function saveSoundVolumePercent(pct: number): void {
  try {
    const n = Math.max(0, Math.min(100, Math.round(pct)));
    localStorage.setItem(VOLUME_KEY, String(n));
  } catch {
    /* ignore */
  }
}
