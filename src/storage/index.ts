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

export const storage = {
  getNotes: (guest = false): Note[] => read<Note>(notesKey(guest)),
  saveNotes: (notes: Note[], guest = false): void => write(notesKey(guest), notes),

  getTasks: (guest = false): Task[] => read<Task>(tasksKey(guest)),
  saveTasks: (tasks: Task[], guest = false): void => write(tasksKey(guest), tasks),

  getPresets: (guest = false): Preset[] => read<Preset>(presetsKey(guest)),
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

  getGuestScheduleTemplates: (): ScheduleTemplate[] => {
    try {
      const raw = localStorage.getItem(GUEST_SCHEDULE_KEY);
      return raw ? (JSON.parse(raw) as ScheduleTemplate[]) : [];
    } catch {
      return [];
    }
  },
  saveGuestScheduleTemplates: (templates: ScheduleTemplate[]): void => {
    localStorage.setItem(GUEST_SCHEDULE_KEY, JSON.stringify(templates));
  },
};
