export type JarvisMode = 'chat' | 'edit';

const KEY = 'notetasks.jarvisMode.v1';

export function loadJarvisMode(): JarvisMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'chat' || v === 'edit') return v;
  } catch {
    /* ignore */
  }
  return 'edit';
}

export function saveJarvisMode(mode: JarvisMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
}
