import type { Note, Task, Preset, ScheduleTemplate } from '../types';

const NOTES_KEY = 'notesapp_notes';
const TASKS_KEY = 'notesapp_tasks';
const PRESETS_KEY = 'notesapp_presets';
const LAST_RESET_KEY = 'notesapp_last_reset_date';

const GUEST_NOTES_KEY = 'notesapp_guest_notes';
const GUEST_TASKS_KEY = 'notesapp_guest_tasks';
const GUEST_PRESETS_KEY = 'notesapp_guest_presets';
const GUEST_LAST_RESET_KEY = 'notesapp_guest_last_reset_date';
const GUEST_SCHEDULE_KEY = 'notesapp_guest_schedule_templates';

/** Local snapshot of the signed-in account's schedule templates, used as a fallback for fresh guest sessions. */
const ACCOUNT_SCHEDULE_CACHE_KEY = 'notesapp_schedule_templates';

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

function notesKey(guest: boolean) {
  return guest ? GUEST_NOTES_KEY : NOTES_KEY;
}
function tasksKey(guest: boolean) {
  return guest ? GUEST_TASKS_KEY : TASKS_KEY;
}
function presetsKey(guest: boolean) {
  return guest ? GUEST_PRESETS_KEY : PRESETS_KEY;
}
function lastResetDateKey(guest: boolean) {
  return guest ? GUEST_LAST_RESET_KEY : LAST_RESET_KEY;
}

/**
 * Reads guest data; if the guest bucket has nothing yet, returns whatever the
 * last signed-in account on this device left in its local cache so a fresh
 * guest session has something to work with instead of an empty workspace.
 */
function readGuestWithAccountFallback<T>(guestKey: string, accountKey: string): T[] {
  const guestItems = read<T>(guestKey);
  if (guestItems.length > 0) return guestItems;
  return read<T>(accountKey);
}

export const storage = {
  getNotes: (guest = false): Note[] =>
    guest ? readGuestWithAccountFallback<Note>(GUEST_NOTES_KEY, NOTES_KEY) : read<Note>(NOTES_KEY),
  saveNotes: (notes: Note[], guest = false): void => write(notesKey(guest), notes),

  getTasks: (guest = false): Task[] =>
    guest ? readGuestWithAccountFallback<Task>(GUEST_TASKS_KEY, TASKS_KEY) : read<Task>(TASKS_KEY),
  saveTasks: (tasks: Task[], guest = false): void => write(tasksKey(guest), tasks),

  getPresets: (guest = false): Preset[] =>
    guest
      ? readGuestWithAccountFallback<Preset>(GUEST_PRESETS_KEY, PRESETS_KEY)
      : read<Preset>(PRESETS_KEY),
  savePresets: (presets: Preset[], guest = false): void => write(presetsKey(guest), presets),

  getLastResetDate: (guest = false): string => {
    try {
      return localStorage.getItem(lastResetDateKey(guest)) ?? '';
    } catch {
      return '';
    }
  },
  saveLastResetDate: (date: string, guest = false): void => {
    localStorage.setItem(lastResetDateKey(guest), date);
  },

  /**
   * Guest schedule templates with the same fallback as notes/tasks: if the
   * guest bucket is empty, reuse whatever templates the last signed-in account
   * cached locally during its session.
   */
  getGuestScheduleTemplates: (): ScheduleTemplate[] => {
    try {
      const raw = localStorage.getItem(GUEST_SCHEDULE_KEY);
      const guestList = raw ? (JSON.parse(raw) as ScheduleTemplate[]) : [];
      if (guestList.length > 0) return guestList;
    } catch {
      /* fall through to account fallback */
    }
    try {
      const raw = localStorage.getItem(ACCOUNT_SCHEDULE_CACHE_KEY);
      return raw ? (JSON.parse(raw) as ScheduleTemplate[]) : [];
    } catch {
      return [];
    }
  },
  saveGuestScheduleTemplates: (templates: ScheduleTemplate[]): void => {
    localStorage.setItem(GUEST_SCHEDULE_KEY, JSON.stringify(templates));
  },

  /**
   * Snapshot of the signed-in account's schedule templates kept on the device
   * so a later guest session can fall back to them when its own bucket is empty.
   */
  saveAccountScheduleTemplatesCache: (templates: ScheduleTemplate[]): void => {
    try {
      localStorage.setItem(ACCOUNT_SCHEDULE_CACHE_KEY, JSON.stringify(templates));
    } catch {
      /* ignore quota / serialization failures */
    }
  },
};
