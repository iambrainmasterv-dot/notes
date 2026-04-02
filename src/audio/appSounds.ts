/**
 * UI sound map — add MP3s under public/sounds/ using the filenames below.
 */
import { loadToastSoundEnabled } from './toastSoundSettings';
import { loadSoundVolume01 } from './soundOutputSettings';

export type AppSoundId =
  | 'deadlineAlert'
  | 'completedTabReminder'
  | 'jarvisDone'
  | 'tabSwitch'
  | 'authSuccess'
  | 'uiTap'
  | 'createAction';

/** Public URL → file in public/sounds/ */
export const APP_SOUND_FILES: Record<AppSoundId, string> = {
  deadlineAlert: '/sounds/notetasks-notify-deadline.mp3',
  completedTabReminder: '/sounds/notetasks-notify-completed-tab.mp3',
  jarvisDone: '/sounds/notetasks-jarvis-done.mp3',
  tabSwitch: '/sounds/notetasks-tab.mp3',
  authSuccess: '/sounds/notetasks-auth.mp3',
  uiTap: '/sounds/notetasks-ui-tap.mp3',
  createAction: '/sounds/notetasks-create.mp3',
};

const audioCache = new Map<string, HTMLAudioElement>();

export function applySoundOutputToAllCachedAudio(): void {
  const v = loadSoundVolume01();
  for (const el of audioCache.values()) {
    el.volume = v;
  }
}

let lastNonUiSoundMs = 0;
const NON_UI_BLOCK_UI_MS = 300;

let lastUiTapMs = 0;
const UI_TAP_MIN_MS = 85;

function prefersReducedSound(): boolean {
  try {
    return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function touchNonUiSoundClock(): void {
  lastNonUiSoundMs = nowMs();
}

export function playAppSound(id: AppSoundId): void {
  if (!loadToastSoundEnabled()) return;
  if (typeof window === 'undefined') return;
  if (prefersReducedSound()) return;

  if (id !== 'uiTap') touchNonUiSoundClock();

  const url = APP_SOUND_FILES[id];
  let el = audioCache.get(url);
  if (!el) {
    try {
      el = new Audio(url);
      el.preload = 'auto';
      audioCache.set(url, el);
    } catch {
      return;
    }
  }
  el.volume = loadSoundVolume01();
  el.currentTime = 0;
  void el.play().catch(() => {
    /* missing file or autoplay policy */
  });
}

/** Throttled generic click sound; skips right after a “special” sound (tab, create, etc.). */
export function tryPlayGlobalUiTapSound(): void {
  if (!loadToastSoundEnabled()) return;
  if (typeof window === 'undefined') return;
  if (prefersReducedSound()) return;

  const t = nowMs();
  if (t - lastNonUiSoundMs < NON_UI_BLOCK_UI_MS) return;
  if (t - lastUiTapMs < UI_TAP_MIN_MS) return;
  lastUiTapMs = t;

  playAppSound('uiTap');
}
