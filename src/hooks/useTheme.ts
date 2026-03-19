import { useEffect, useCallback } from 'react';
import type { ThemeMode, AccentColor, UIScale, FontScale, ThemeSettings } from '../types';

interface AccentPalette {
  primary: string;
  primaryHover: string;
  ring: string;
  progressEnd: string;
}

const ACCENT_PALETTES: Record<AccentColor, AccentPalette> = {
  blue:    { primary: '#3b82f6', primaryHover: '#2563eb', ring: 'rgba(59,130,246,0.18)',  progressEnd: '#06b6d4' },
  indigo:  { primary: '#6366f1', primaryHover: '#4f46e5', ring: 'rgba(99,102,241,0.18)',  progressEnd: '#818cf8' },
  purple:  { primary: '#8b5cf6', primaryHover: '#7c3aed', ring: 'rgba(139,92,246,0.18)',  progressEnd: '#a78bfa' },
  violet:  { primary: '#7c3aed', primaryHover: '#6d28d9', ring: 'rgba(124,58,237,0.18)',  progressEnd: '#8b5cf6' },
  teal:    { primary: '#14b8a6', primaryHover: '#0d9488', ring: 'rgba(20,184,166,0.18)',  progressEnd: '#2dd4bf' },
  emerald: { primary: '#10b981', primaryHover: '#059669', ring: 'rgba(16,185,129,0.18)',  progressEnd: '#34d399' },
  lime:    { primary: '#84cc16', primaryHover: '#65a30d', ring: 'rgba(132,204,22,0.18)',  progressEnd: '#a3e635' },
  orange:  { primary: '#f97316', primaryHover: '#ea580c', ring: 'rgba(249,115,22,0.18)',  progressEnd: '#fb923c' },
  amber:   { primary: '#f59e0b', primaryHover: '#d97706', ring: 'rgba(245,158,11,0.18)',  progressEnd: '#fbbf24' },
  pink:    { primary: '#ec4899', primaryHover: '#db2777', ring: 'rgba(236,72,153,0.18)',  progressEnd: '#f472b6' },
  rose:    { primary: '#f43f5e', primaryHover: '#e11d48', ring: 'rgba(244,63,94,0.18)',   progressEnd: '#fb7185' },
  red:     { primary: '#ef4444', primaryHover: '#dc2626', ring: 'rgba(239,68,68,0.18)',   progressEnd: '#f87171' },
  slate:   { primary: '#64748b', primaryHover: '#475569', ring: 'rgba(100,116,139,0.18)', progressEnd: '#94a3b8' },
  zinc:    { primary: '#71717a', primaryHover: '#52525b', ring: 'rgba(113,113,122,0.18)', progressEnd: '#a1a1aa' },
};

const UI_SCALE_MAP: Record<UIScale, string> = { compact: '0.88', default: '1', comfortable: '1.12' };
const FONT_SCALE_MAP: Record<FontScale, string> = { small: '13px', default: '14px', large: '16px' };

function resolveMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Pure visual applicator — applies CSS variables from settings.
 * Does NOT own persistence; that's handled by useUserSettings.
 */
export function useThemeApply(settings: ThemeSettings) {
  const applyTheme = useCallback((s: ThemeSettings) => {
    const resolved = resolveMode(s.mode);
    const root = document.documentElement;
    root.setAttribute('data-theme', resolved);

    const p = ACCENT_PALETTES[s.accent] ?? ACCENT_PALETTES.blue;
    root.style.setProperty('--primary', p.primary);
    root.style.setProperty('--primary-hover', p.primaryHover);
    root.style.setProperty('--primary-ring', p.ring);
    root.style.setProperty('--progress-end', p.progressEnd);
    root.style.setProperty('--ui-scale', UI_SCALE_MAP[s.uiScale] ?? '1');
    root.style.setProperty('--font-base', FONT_SCALE_MAP[s.fontScale] ?? '14px');
  }, []);

  useEffect(() => {
    applyTheme(settings);
  }, [settings, applyTheme]);

  useEffect(() => {
    if (settings.mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme(settings);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [settings, applyTheme]);
}
