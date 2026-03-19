import { useState, useCallback, useEffect } from 'react';
import { v4 as uuid } from 'uuid';
import type { Preset, PresetItem } from '../types';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { storage } from '../storage';

function fromApiPreset(row: Record<string, unknown>): Preset {
  const items = (row.items as Record<string, unknown>[]) ?? [];
  return {
    id: row.id as string,
    name: row.name as string,
    items: items.map((it) => ({
      type: it.type as 'note' | 'task',
      title: it.title as string,
      description: it.description as string,
      deadline: (it.deadline_time as string) || undefined,
      target: (it.target as number) ?? undefined,
    })),
  };
}

export function usePresets() {
  const { user } = useAuth();
  const [presets, setPresets] = useState<Preset[]>([]);

  useEffect(() => {
    if (!user) return;
    api.getPresets()
      .then((rows) => setPresets(rows.map(fromApiPreset)))
      .catch(() => setPresets(storage.getPresets()));
  }, [user]);

  useEffect(() => {
    storage.savePresets(presets);
  }, [presets]);

  const addPreset = useCallback(
    (name: string, items: PresetItem[]) => {
      const preset: Preset = { id: uuid(), name, items };
      setPresets((prev) => [...prev, preset]);

      api.createPreset({
        id: preset.id,
        name,
        items: items.map((it, i) => ({
          id: uuid(),
          type: it.type,
          title: it.title,
          description: it.description,
          deadline_time: it.deadline ?? null,
          target: it.target ?? null,
          sort_order: i,
        })),
      }).catch(() => {});

      return preset;
    },
    [],
  );

  const updatePreset = useCallback(
    (id: string, patch: Partial<Omit<Preset, 'id'>>) => {
      setPresets((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      if (patch.name !== undefined) api.updatePreset(id, { name: patch.name }).catch(() => {});
    },
    [],
  );

  const deletePreset = useCallback(
    (id: string) => {
      setPresets((prev) => prev.filter((p) => p.id !== id));
      api.deletePreset(id).catch(() => {});
    },
    [],
  );

  return { presets, addPreset, updatePreset, deletePreset };
}
