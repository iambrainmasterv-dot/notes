export interface Note {
  id: string;
  type: 'note';
  title: string;
  description: string;
  completed: boolean;
  createdAt: string;
  /** Full datetime "YYYY-MM-DDTHH:mm" for regular, time-only "HH:mm" for daily */
  deadline?: string;
  parentId?: string;
  position?: { x: number; y: number };
  collapsed?: boolean;
  daily?: boolean;
}

export interface Task {
  id: string;
  type: 'task';
  title: string;
  description: string;
  completed: boolean;
  createdAt: string;
  deadline?: string;
  target: number;
  progress: number;
  daily?: boolean;
}

export type Item = Note | Task;

export type ViewMode = 'list' | 'table' | 'canvas';

export type Page = 'pool' | 'schedule' | 'notes' | 'tasks' | 'completed';

export type SortField = 'title' | 'deadline' | 'createdAt' | 'progress' | 'type';
export type SortDir = 'asc' | 'desc';

export type ThemeMode = 'light' | 'dark' | 'system';

export type AccentColor =
  | 'blue' | 'indigo' | 'purple' | 'violet'
  | 'teal' | 'emerald' | 'lime'
  | 'orange' | 'amber'
  | 'pink' | 'rose' | 'red'
  | 'slate' | 'zinc';

export type UIScale = 'compact' | 'default' | 'comfortable';
export type FontScale = 'small' | 'default' | 'large';

export interface ThemeSettings {
  mode: ThemeMode;
  accent: AccentColor;
  uiScale: UIScale;
  fontScale: FontScale;
  dailyResetTime: string;
}

export type DeadlineSeverity = 'ok' | 'soon' | 'urgent' | 'expired';

export interface DeadlineState {
  label: string;
  expired: boolean;
  severity: DeadlineSeverity;
}

export interface PresetItem {
  type: 'note' | 'task';
  title: string;
  description: string;
  deadline?: string;
  target?: number;
}

export interface Preset {
  id: string;
  name: string;
  items: PresetItem[];
}

export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export type ScheduleKind = 'weekday' | 'date' | 'none';

export interface ScheduleTemplateItem {
  id: string;
  type: 'note' | 'task';
  title: string;
  description: string;
  deadlineTime?: string | null;
  target?: number | null;
  sortOrder: number;
}

export interface ScheduleTemplate {
  id: string;
  name: string;
  description: string;
  scheduleKind: ScheduleKind;
  scheduleValue: string | null;
  items: ScheduleTemplateItem[];
  createdAt: string;
}
