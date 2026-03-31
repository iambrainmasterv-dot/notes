const LS_KEY = 'notetasks.toastSounds';

export function loadToastSoundEnabled(): boolean {
  try {
    return localStorage.getItem(LS_KEY) !== '0';
  } catch {
    return true;
  }
}

export function saveToastSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(LS_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}
