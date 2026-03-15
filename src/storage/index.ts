import type { Note, Task, Preset } from '../types';

const NOTES_KEY = 'notesapp_notes';
const TASKS_KEY = 'notesapp_tasks';
const PRESETS_KEY = 'notesapp_presets';
const LAST_RESET_KEY = 'notesapp_last_reset_date';

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

export const storage = {
  getNotes: (): Note[] => read<Note>(NOTES_KEY),
  saveNotes: (notes: Note[]): void => write(NOTES_KEY, notes),

  getTasks: (): Task[] => read<Task>(TASKS_KEY),
  saveTasks: (tasks: Task[]): void => write(TASKS_KEY, tasks),

  getPresets: (): Preset[] => read<Preset>(PRESETS_KEY),
  savePresets: (presets: Preset[]): void => write(PRESETS_KEY, presets),

  getLastResetDate: (): string => {
    try { return localStorage.getItem(LAST_RESET_KEY) ?? ''; } catch { return ''; }
  },
  saveLastResetDate: (date: string): void => {
    localStorage.setItem(LAST_RESET_KEY, date);
  },
};
