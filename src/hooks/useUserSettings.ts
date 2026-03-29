import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import type { ThemeSettings } from '../types';

const THEME_KEY = 'notesapp_theme';
const LAST_RESET_TAG_LS = 'notesapp_last_reset_tag';

function loadLocalSettings(): ThemeSettings {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<ThemeSettings>;
      return {
        mode: p.mode ?? 'system',
        accent: p.accent ?? 'blue',
        uiScale: p.uiScale ?? 'default',
        fontScale: p.fontScale ?? 'default',
        dailyResetTime: p.dailyResetTime ?? '00:00',
        aiAgentMutationsEnabled: p.aiAgentMutationsEnabled !== false,
      };
    }
  } catch { /* ignore */ }
  return {
    mode: 'system',
    accent: 'blue',
    uiScale: 'default',
    fontScale: 'default',
    dailyResetTime: '00:00',
    aiAgentMutationsEnabled: true,
  };
}

export function useUserSettings() {
  const { user, isGuest } = useAuth();
  const [settings, setSettings] = useState<ThemeSettings>(loadLocalSettings);
  const [lastResetTag, setLastResetTag] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_RESET_TAG_LS);
    } catch {
      return null;
    }
  });
  const loaded = useRef(false);

  useEffect(() => {
    if (isGuest) {
      try {
        const t = localStorage.getItem(LAST_RESET_TAG_LS);
        setLastResetTag(t);
      } catch {
        /* ignore */
      }
      loaded.current = true;
      return;
    }
    if (!user) return;
    api.getSettings()
      .then((data) => {
        const remote: ThemeSettings = {
          mode: (data.theme_mode as ThemeSettings['mode']) ?? 'system',
          accent: (data.accent as ThemeSettings['accent']) ?? 'blue',
          uiScale: (data.ui_scale as ThemeSettings['uiScale']) ?? 'default',
          fontScale: (data.font_scale as ThemeSettings['fontScale']) ?? 'default',
          dailyResetTime: (data.daily_reset_time as string) ?? '00:00',
          aiAgentMutationsEnabled: data.ai_agent_mutations_enabled !== false,
        };
        setSettings(remote);
        const tag = (data.last_reset_tag as string) ?? null;
        setLastResetTag(tag);
        if (tag) {
          try {
            localStorage.setItem(LAST_RESET_TAG_LS, tag);
          } catch {
            /* ignore */
          }
        }
        localStorage.setItem(THEME_KEY, JSON.stringify(remote));
        loaded.current = true;
      })
      .catch(() => {
        loaded.current = true;
      });
  }, [user, isGuest]);

  const update = useCallback(
    (patch: Partial<ThemeSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        localStorage.setItem(THEME_KEY, JSON.stringify(next));

        const dbPatch: Record<string, unknown> = {};
        if (patch.mode !== undefined) dbPatch.theme_mode = patch.mode;
        if (patch.accent !== undefined) dbPatch.accent = patch.accent;
        if (patch.uiScale !== undefined) dbPatch.ui_scale = patch.uiScale;
        if (patch.fontScale !== undefined) dbPatch.font_scale = patch.fontScale;
        if (patch.dailyResetTime !== undefined) dbPatch.daily_reset_time = patch.dailyResetTime;
        if (patch.aiAgentMutationsEnabled !== undefined) {
          dbPatch.ai_agent_mutations_enabled = patch.aiAgentMutationsEnabled;
        }
        if (Object.keys(dbPatch).length > 0) api.updateSettings(dbPatch).catch(() => {});

        return next;
      });
    },
    [],
  );

  const saveResetTag = useCallback((tag: string) => {
    setLastResetTag(tag);
    try {
      localStorage.setItem(LAST_RESET_TAG_LS, tag);
    } catch {
      /* ignore */
    }
    api.updateSettings({ last_reset_tag: tag }).catch(() => {});
  }, []);

  return { settings, update, lastResetTag, saveResetTag };
}
