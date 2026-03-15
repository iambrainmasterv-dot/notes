import { useState, useCallback, useEffect } from 'react';
import { v4 as uuid } from 'uuid';
import type { Preset, PresetItem } from '../types';
import { storage } from '../storage';

export function usePresets() {
  const [presets, setPresets] = useState<Preset[]>(() => storage.getPresets());

  useEffect(() => {
    storage.savePresets(presets);
  }, [presets]);

  const addPreset = useCallback((name: string, items: PresetItem[]) => {
    const preset: Preset = { id: uuid(), name, items };
    setPresets((prev) => [...prev, preset]);
    return preset;
  }, []);

  const updatePreset = useCallback((id: string, patch: Partial<Omit<Preset, 'id'>>) => {
    setPresets((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const deletePreset = useCallback((id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { presets, addPreset, updatePreset, deletePreset };
}
