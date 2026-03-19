import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuid } from 'uuid';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import type { DailyTemplate } from './useDailyTemplates';

export interface DailyInstance {
  id: string;
  dayDate: string;
  sourceTemplateId: string | null;
  presetId: string | null;
  type: 'note' | 'task';
  title: string;
  description: string;
  deadlineTime: string | null;
  target: number;
  progress: number;
  completed: boolean;
  createdAt: string;
}

function fromApi(row: Record<string, unknown>): DailyInstance {
  return {
    id: row.id as string,
    dayDate: row.day_date as string,
    sourceTemplateId: (row.source_template_id as string) || null,
    presetId: (row.preset_id as string) || null,
    type: row.type as 'note' | 'task',
    title: row.title as string,
    description: row.description as string,
    deadlineTime: (row.deadline_time as string) || null,
    target: row.target as number,
    progress: row.progress as number,
    completed: row.completed as boolean,
    createdAt: row.created_at as string,
  };
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function useDailyInstances(templates: DailyTemplate[], dailyResetTime: string, lastResetTag: string | null) {
  const { user } = useAuth();
  const [instances, setInstances] = useState<DailyInstance[]>([]);
  const [selectedDay, setSelectedDay] = useState<string>(todayStr);
  const spawnedRef = useRef(false);

  const loadDay = useCallback(
    async (day: string) => {
      if (!user) return;
      try {
        const rows = await api.getInstances(day);
        setInstances(rows.map(fromApi));
      } catch { /* ignore */ }
    },
    [user],
  );

  useEffect(() => {
    if (!user) return;
    loadDay(selectedDay);
  }, [user, selectedDay, loadDay]);

  const spawnFromTemplates = useCallback(
    async (day: string) => {
      if (!user || templates.length === 0) return;
      try {
        const existingIds = new Set(await api.getTemplateIds(day));
        const now = new Date().toISOString();
        const toInsert = templates
          .filter((t) => !existingIds.has(t.id))
          .map((t) => ({
            id: uuid(),
            day_date: day,
            source_template_id: t.id,
            preset_id: null,
            type: t.type,
            title: t.title,
            description: t.description,
            deadline_time: t.deadlineTime,
            target: t.target,
            progress: 0,
            completed: false,
            created_at: now,
          }));

        if (toInsert.length > 0) {
          await api.createInstancesBulk(toInsert);
          if (day === selectedDay) loadDay(day);
        }
      } catch { /* ignore */ }
    },
    [user, templates, selectedDay, loadDay],
  );

  useEffect(() => {
    if (spawnedRef.current || !user) return;
    const today = todayStr();
    const expectedTag = `${today}|${dailyResetTime || '00:00'}`;
    const now = new Date();
    const [h, m] = (dailyResetTime || '00:00').split(':').map(Number);
    const resetMoment = new Date();
    resetMoment.setHours(h, m, 0, 0);

    if (now >= resetMoment && lastResetTag !== expectedTag) return;

    spawnFromTemplates(today);
    spawnedRef.current = true;
  }, [user, templates, dailyResetTime, lastResetTag, spawnFromTemplates]);

  useEffect(() => {
    if (!user) return;
    const today = todayStr();
    const expectedTag = `${today}|${dailyResetTime || '00:00'}`;
    if (lastResetTag === expectedTag && !spawnedRef.current) {
      spawnFromTemplates(today);
      spawnedRef.current = true;
    }
  }, [lastResetTag, user, dailyResetTime, spawnFromTemplates]);

  const addInstance = useCallback(
    async (data: Omit<DailyInstance, 'id' | 'createdAt'>) => {
      const inst: DailyInstance = { ...data, id: uuid(), createdAt: new Date().toISOString() };
      setInstances((prev) => [...prev, inst]);
      api.createInstance({
        id: inst.id,
        day_date: inst.dayDate,
        source_template_id: inst.sourceTemplateId,
        preset_id: inst.presetId,
        type: inst.type,
        title: inst.title,
        description: inst.description,
        deadline_time: inst.deadlineTime,
        target: inst.target,
        progress: inst.progress,
        completed: inst.completed,
        created_at: inst.createdAt,
      }).catch(() => {});
      return inst;
    },
    [],
  );

  const updateInstance = useCallback(
    (id: string, patch: Partial<DailyInstance>) => {
      setInstances((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
      const dbPatch: Record<string, unknown> = {};
      if (patch.title !== undefined) dbPatch.title = patch.title;
      if (patch.description !== undefined) dbPatch.description = patch.description;
      if (patch.completed !== undefined) dbPatch.completed = patch.completed;
      if (patch.progress !== undefined) dbPatch.progress = patch.progress;
      if (patch.target !== undefined) dbPatch.target = patch.target;
      if (patch.deadlineTime !== undefined) dbPatch.deadline_time = patch.deadlineTime;
      if (Object.keys(dbPatch).length) api.updateInstance(id, dbPatch).catch(() => {});
    },
    [],
  );

  const deleteInstance = useCallback(
    (id: string) => {
      setInstances((prev) => prev.filter((i) => i.id !== id));
      api.deleteInstance(id).catch(() => {});
    },
    [],
  );

  const deletePresetInstances = useCallback(
    async (day: string) => {
      setInstances((prev) => prev.filter((i) => i.dayDate !== day || i.presetId === null));
      api.deletePresetInstances(day).catch(() => {});
    },
    [],
  );

  const deleteManualInstances = useCallback(
    async (day: string) => {
      setInstances((prev) => prev.filter(
        (i) => i.dayDate !== day || i.sourceTemplateId !== null || i.presetId !== null,
      ));
    },
    [],
  );

  return {
    instances,
    selectedDay,
    setSelectedDay,
    addInstance,
    updateInstance,
    deleteInstance,
    deletePresetInstances,
    deleteManualInstances,
    spawnFromTemplates,
    loadDay,
  };
}
