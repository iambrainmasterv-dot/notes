import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuid } from 'uuid';
import type { ScheduleTemplate, ScheduleTemplateItem, ScheduleKind, ScheduleRules, Weekday } from '../types';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { normalizeWeekdayToken, normalizeYearlyDate } from '../utils/scheduleTemplate';

interface RawItem {
  id: string;
  type: 'note' | 'task';
  title: string;
  description: string;
  deadline_time?: string | null;
  target?: number | null;
  sort_order: number;
}

interface RawTemplate {
  id: string;
  name: string;
  description: string;
  schedule_kind: string;
  schedule_value: string | null;
  schedule_rules?: unknown;
  created_at: string;
  items: RawItem[];
}

function coerceKind(k: string): ScheduleKind {
  const s = (k || 'none').toLowerCase();
  if (s === 'weekday') return 'weekdays';
  if (s === 'date') return 'more';
  if (['none', 'daily', 'weekdays', 'dates', 'more'].includes(s)) return s as ScheduleKind;
  return 'none';
}

function fromApi(raw: RawTemplate): ScheduleTemplate {
  let rules: ScheduleRules =
    raw.schedule_rules && typeof raw.schedule_rules === 'object'
      ? { ...(raw.schedule_rules as ScheduleRules) }
      : {};
  const kind = coerceKind(raw.schedule_kind);
  if (kind === 'weekdays' && (!rules.weekdays || rules.weekdays.length === 0) && raw.schedule_value) {
    const w = normalizeWeekdayToken(raw.schedule_value);
    if (w) rules = { ...rules, weekdays: [w as Weekday] };
  }
  if (kind === 'more' && (!rules.yearlyDates || rules.yearlyDates.length === 0) && raw.schedule_value) {
    const y = normalizeYearlyDate(raw.schedule_value);
    if (y) rules = { ...rules, yearlyDates: [y] };
  }
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    scheduleKind: kind,
    scheduleValue: raw.schedule_value,
    scheduleRules: rules,
    createdAt: raw.created_at,
    items: (raw.items || []).map((it) => ({
      id: it.id,
      type: it.type,
      title: it.title,
      description: it.description,
      deadlineTime: it.deadline_time,
      target: it.target,
      sortOrder: it.sort_order,
    })),
  };
}

export interface NewScheduleTemplateData {
  name: string;
  description: string;
  scheduleKind: ScheduleKind;
  scheduleValue: string | null;
  scheduleRules: ScheduleRules;
  items: Omit<ScheduleTemplateItem, 'id' | 'sortOrder'>[];
}

export function useScheduleTemplates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const loaded = useRef(false);

  useEffect(() => {
    if (!user || loaded.current) return;
    loaded.current = true;
    api
      .getScheduleTemplates()
      .then((rows) => {
        setTemplates((rows as unknown as RawTemplate[]).map(fromApi));
      })
      .catch(() => {});
  }, [user]);

  const addTemplate = useCallback(async (data: NewScheduleTemplateData) => {
    const id = uuid();
    const items = data.items.map((it, i) => ({
      id: uuid(),
      type: it.type,
      title: it.title,
      description: it.description,
      deadline_time: it.deadlineTime ?? null,
      target: it.target ?? null,
      sort_order: i,
    }));
    const raw = (await api.createScheduleTemplate({
      id,
      name: data.name,
      description: data.description,
      schedule_kind: data.scheduleKind,
      schedule_value: data.scheduleValue,
      schedule_rules: data.scheduleRules,
      items,
    })) as unknown as RawTemplate;
    const tpl = fromApi(raw);
    setTemplates((prev) => [...prev, tpl]);
    return tpl;
  }, []);

  const deleteTemplate = useCallback(async (id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    await api.deleteScheduleTemplate(id).catch(() => {});
  }, []);

  const updateTemplate = useCallback(async (id: string, patch: Partial<NewScheduleTemplateData>) => {
    const apiPatch: Record<string, unknown> = {};
    if (patch.name !== undefined) apiPatch.name = patch.name;
    if (patch.description !== undefined) apiPatch.description = patch.description;
    if (patch.scheduleKind !== undefined) apiPatch.schedule_kind = patch.scheduleKind;
    if (patch.scheduleValue !== undefined) apiPatch.schedule_value = patch.scheduleValue;
    if (patch.scheduleRules !== undefined) apiPatch.schedule_rules = patch.scheduleRules;
    if (patch.items !== undefined) {
      apiPatch.items = patch.items.map((it, i) => ({
        id: uuid(),
        type: it.type,
        title: it.title,
        description: it.description,
        deadline_time: it.deadlineTime ?? null,
        target: it.target ?? null,
        sort_order: i,
      }));
    }
    await api.updateScheduleTemplate(id, apiPatch).catch(() => {});
    const rows = await api.getScheduleTemplates().catch(() => []);
    setTemplates((rows as unknown as RawTemplate[]).map(fromApi));
  }, []);

  const refetch = useCallback(() => {
    api
      .getScheduleTemplates()
      .then((rows) => {
        setTemplates((rows as unknown as RawTemplate[]).map(fromApi));
      })
      .catch(() => {});
  }, []);

  return { templates, addTemplate, updateTemplate, deleteTemplate, refetch };
}
