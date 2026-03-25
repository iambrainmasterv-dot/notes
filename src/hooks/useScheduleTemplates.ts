import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuid } from 'uuid';
import type { ScheduleTemplate, ScheduleTemplateItem, ScheduleKind } from '../types';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

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
  schedule_kind: ScheduleKind;
  schedule_value: string | null;
  created_at: string;
  items: RawItem[];
}

function fromApi(raw: RawTemplate): ScheduleTemplate {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    scheduleKind: raw.schedule_kind,
    scheduleValue: raw.schedule_value,
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
  items: Omit<ScheduleTemplateItem, 'id' | 'sortOrder'>[];
}

export function useScheduleTemplates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const loaded = useRef(false);

  useEffect(() => {
    if (!user || loaded.current) return;
    loaded.current = true;
    api.getScheduleTemplates().then((rows) => {
      setTemplates((rows as unknown as RawTemplate[]).map(fromApi));
    }).catch(() => {});
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
    const raw = await api.createScheduleTemplate({
      id,
      name: data.name,
      description: data.description,
      schedule_kind: data.scheduleKind,
      schedule_value: data.scheduleValue,
      items,
    }) as unknown as RawTemplate;
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
    // Refetch for simplicity
    const rows = await api.getScheduleTemplates().catch(() => []);
    setTemplates((rows as unknown as RawTemplate[]).map(fromApi));
  }, []);

  return { templates, addTemplate, updateTemplate, deleteTemplate };
}
