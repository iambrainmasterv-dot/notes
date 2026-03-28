export type ParentType = 'note' | 'task';

export interface Note {
  id: string;
  type: 'note';
  title: string;
  description: string;
  completed: boolean;
  /** ISO timestamp when marked complete; cleared on recover */
  completedAt?: string;
  createdAt: string;
  /** Full datetime "YYYY-MM-DDTHH:mm" for regular, time-only "HH:mm" for daily */
  deadline?: string;
  parentId?: string;
  /** Parent item type; omitted + parentId on legacy rows means parent is a note */
  parentType?: ParentType;
  position?: { x: number; y: number };
  collapsed?: boolean;
  daily?: boolean;
  /** Set when materialized from a schedule template */
  sourceScheduleTemplateId?: string;
  sourceOccurrenceDate?: string;
}

export interface Task {
  id: string;
  type: 'task';
  title: string;
  description: string;
  completed: boolean;
  /** ISO timestamp when marked complete; cleared on recover */
  completedAt?: string;
  createdAt: string;
  deadline?: string;
  parentId?: string;
  parentType?: ParentType;
  target: number;
  progress: number;
  daily?: boolean;
  sourceScheduleTemplateId?: string;
  sourceOccurrenceDate?: string;
}

export type Item = Note | Task;

export type ViewMode = 'list' | 'table' | 'canvas';

export type Page = 'pool' | 'schedule' | 'notes' | 'tasks' | 'completed' | 'assistant';

/** Suggested main tab when Jarvis touches schedule vs notes vs tasks data */
export type AssistantWorkContext = 'notes' | 'tasks' | 'schedule';

export type SortField = 'title' | 'deadline' | 'createdAt' | 'progress' | 'type' | 'completedAt';
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
  /** When false, Jarvis cannot create, update, or delete items (chat only). */
  aiAgentMutationsEnabled: boolean;
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
/** none = stored only; daily = every day; weekdays = chosen week days; dates = days 1–31 each month; more = yearly MM-DD list */
export type ScheduleKind = 'none' | 'daily' | 'weekdays' | 'dates' | 'more';

export interface ScheduleRules {
  weekdays?: Weekday[];
  monthDays?: number[];
  yearlyDates?: string[];
}

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
  /** Legacy single value; prefer scheduleRules for weekdays / dates / more */
  scheduleValue: string | null;
  scheduleRules: ScheduleRules;
  items: ScheduleTemplateItem[];
  createdAt: string;
}

export type NotificationLevel = 'info' | 'warning' | 'danger';

export interface AppNotification {
  id: string;
  level: NotificationLevel;
  title: string;
  message: string;
  createdAt: number;
  read: boolean;
  /** Dedup key e.g. task:id:1h */
  dedupeKey: string;
  itemType?: 'note' | 'task';
  itemId?: string;
}
