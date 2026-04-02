import { useState } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { ThemeMode, AccentColor, UIScale, FontScale, ThemeSettings } from '../types';
import type { AndroidNotifUserSettings } from '../notifications/androidSettings';
import { loadToastSoundEnabled, saveToastSoundEnabled } from '../audio/toastSoundSettings';
import {
  loadSoundMuted,
  loadSoundVolumePercent,
  saveSoundMuted,
  saveSoundVolumePercent,
} from '../audio/soundOutputSettings';
import { applySoundOutputToAllCachedAudio } from '../audio/appSounds';
import { APP_VERSION } from '../version';

interface Props {
  settings: ThemeSettings;
  onUpdate: (patch: Partial<ThemeSettings>) => void;
  /** True when this device still has notes/tasks in local storage (pre-account). */
  localImportAvailable: boolean;
  onImportLocal: () => void | Promise<void>;
  onRerunTutorial?: () => void;
  androidNotif?: AndroidNotifUserSettings;
  onAndroidNotifChange?: (patch: Partial<AndroidNotifUserSettings>) => void;
}

const modes: { value: ThemeMode; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: '☀' },
  { value: 'dark', label: 'Dark', icon: '◑' },
  { value: 'system', label: 'Auto', icon: '◐' },
];

const accents: { value: AccentColor; color: string; label: string }[] = [
  { value: 'blue', color: '#3b82f6', label: 'Blue' },
  { value: 'indigo', color: '#6366f1', label: 'Indigo' },
  { value: 'purple', color: '#8b5cf6', label: 'Purple' },
  { value: 'violet', color: '#7c3aed', label: 'Violet' },
  { value: 'teal', color: '#14b8a6', label: 'Teal' },
  { value: 'emerald', color: '#10b981', label: 'Emerald' },
  { value: 'lime', color: '#84cc16', label: 'Lime' },
  { value: 'orange', color: '#f97316', label: 'Orange' },
  { value: 'amber', color: '#f59e0b', label: 'Amber' },
  { value: 'pink', color: '#ec4899', label: 'Pink' },
  { value: 'rose', color: '#f43f5e', label: 'Rose' },
  { value: 'red', color: '#ef4444', label: 'Red' },
  { value: 'slate', color: '#64748b', label: 'Slate' },
  { value: 'zinc', color: '#71717a', label: 'Zinc' },
];

const uiScales: { value: UIScale; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'default', label: 'Default' },
  { value: 'comfortable', label: 'Comfy' },
];

const fontScales: { value: FontScale; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'default', label: 'Default' },
  { value: 'large', label: 'Large' },
];

export function ThemePanel({
  settings,
  onUpdate,
  localImportAvailable,
  onImportLocal,
  onRerunTutorial,
  androidNotif,
  onAndroidNotifChange,
}: Props) {
  const [toastSounds, setToastSounds] = useState(loadToastSoundEnabled);
  const [soundMuted, setSoundMuted] = useState(loadSoundMuted);
  const [soundVolumePct, setSoundVolumePct] = useState(loadSoundVolumePercent);

  return (
    <div className="theme-panel">
      <div className="theme-section">
        <span className="theme-label">Data</span>
        <p className="theme-help">
          {localImportAvailable
            ? 'Local notes or tasks were found on this device from before you signed in.'
            : 'No local-only notes or tasks found on this device.'}
        </p>
        <button
          type="button"
          className="btn btn-full"
          disabled={!localImportAvailable}
          onClick={() => onImportLocal()}
        >
          Import local notes &amp; tasks
        </button>
      </div>

      <div className="theme-section">
        <span className="theme-label">Appearance</span>
        <div className="theme-modes">
          {modes.map((m) => (
            <button
              key={m.value}
              className={`theme-mode-btn ${settings.mode === m.value ? 'active' : ''}`}
              onClick={() => onUpdate({ mode: m.value })}
            >
              <span>{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="theme-section">
        <span className="theme-label">Accent Color</span>
        <div className="accent-row">
          {accents.map((a) => (
            <button
              key={a.value}
              className={`accent-dot ${settings.accent === a.value ? 'active' : ''}`}
              style={{ '--dot-color': a.color } as React.CSSProperties}
              onClick={() => onUpdate({ accent: a.value })}
              aria-label={a.label}
              title={a.label}
            />
          ))}
        </div>
      </div>

      <div className="theme-section">
        <span className="theme-label">UI Density</span>
        <div className="theme-modes">
          {uiScales.map((s) => (
            <button
              key={s.value}
              className={`theme-mode-btn ${settings.uiScale === s.value ? 'active' : ''}`}
              onClick={() => onUpdate({ uiScale: s.value })}
            >
              <span>{s.value === 'compact' ? '▪' : s.value === 'default' ? '▫' : '□'}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="theme-section">
        <span className="theme-label">Text Size</span>
        <div className="theme-modes">
          {fontScales.map((f) => (
            <button
              key={f.value}
              className={`theme-mode-btn ${settings.fontScale === f.value ? 'active' : ''}`}
              onClick={() => onUpdate({ fontScale: f.value })}
            >
              <span style={{ fontSize: f.value === 'small' ? '0.7em' : f.value === 'large' ? '1.1em' : '0.9em' }}>Aa</span>
              <span>{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="theme-section">
        <span className="theme-label">Daily Reset Time</span>
        <input
          type="time"
          className="input"
          value={settings.dailyResetTime ?? '00:00'}
          onChange={(e) => onUpdate({ dailyResetTime: e.target.value })}
          style={{ width: 'auto' }}
        />
      </div>

      <div className="theme-section">
        <span className="theme-label">App sounds</span>
        <p className="theme-help">
          When enabled, the app plays short MP3s from <code>public/sounds/</code>: deadline toasts (
          <code>notetasks-notify-deadline.mp3</code>), Completed-tab reminder (
          <code>notetasks-notify-completed-tab.mp3</code>), Jarvis reply (
          <code>notetasks-jarvis-done.mp3</code>), tab change (<code>notetasks-tab.mp3</code>), sign-in /
          guest (<code>notetasks-auth.mp3</code>), most other clicks (<code>notetasks-ui-tap.mp3</code>),
          new note/task or Jarvis send (<code>notetasks-create.mp3</code>). Use ~0.2–1.2s clips, normalized.
        </p>
        <div className="theme-modes">
          <button
            type="button"
            className={`theme-mode-btn ${toastSounds ? 'active' : ''}`}
            onClick={() => {
              saveToastSoundEnabled(true);
              setToastSounds(true);
            }}
          >
            <span>✓</span>
            <span>Sound on</span>
          </button>
          <button
            type="button"
            className={`theme-mode-btn ${!toastSounds ? 'active' : ''}`}
            onClick={() => {
              saveToastSoundEnabled(false);
              setToastSounds(false);
            }}
          >
            <span>○</span>
            <span>Sound off</span>
          </button>
        </div>
        <div
          className="theme-modes"
          style={{ marginTop: 12, opacity: toastSounds ? 1 : 0.45, pointerEvents: toastSounds ? 'auto' : 'none' }}
        >
          <button
            type="button"
            className={`theme-mode-btn ${!soundMuted ? 'active' : ''}`}
            onClick={() => {
              saveSoundMuted(false);
              setSoundMuted(false);
              applySoundOutputToAllCachedAudio();
            }}
          >
            <span>✓</span>
            <span>Unmuted</span>
          </button>
          <button
            type="button"
            className={`theme-mode-btn ${soundMuted ? 'active' : ''}`}
            onClick={() => {
              saveSoundMuted(true);
              setSoundMuted(true);
              applySoundOutputToAllCachedAudio();
            }}
          >
            <span>○</span>
            <span>Mute</span>
          </button>
        </div>
        <label className="theme-label" style={{ display: 'block', marginTop: 12 }}>
          Volume
        </label>
        <input
          type="range"
          className="input"
          min={0}
          max={100}
          value={soundVolumePct}
          disabled={!toastSounds}
          onChange={(e) => {
            const v = Number(e.target.value);
            setSoundVolumePct(v);
            saveSoundVolumePercent(v);
            applySoundOutputToAllCachedAudio();
          }}
          style={{ width: '100%', maxWidth: 280, marginTop: 8, display: 'block' }}
        />
      </div>

      {androidNotif && onAndroidNotifChange && (
        <div className="theme-section">
          <span className="theme-label">Android notifications</span>
          <p className="theme-help">
            Deadline pushes use your per-item reminder (default 10 minutes before, plus at due time). Optional daily
            digest, ~2h check-in when you have due-today items, daily progress, or matching templates tomorrow, and
            pinned items. Custom sound: copy{' '}
            <code>public/sounds/notetasks-notify-deadline.mp3</code> to Android{' '}
            <code>res/raw/notetasks_notify_deadline.mp3</code>. Requires notification permission.
          </p>
          <button
            type="button"
            className="btn btn-full"
            style={{ marginBottom: 12 }}
            onClick={() => void LocalNotifications.requestPermissions()}
          >
            Allow notification permission
          </button>
          <div className="theme-modes">
            <button
              type="button"
              className={`theme-mode-btn ${androidNotif.masterEnabled ? 'active' : ''}`}
              onClick={() => onAndroidNotifChange({ masterEnabled: true })}
            >
              <span>✓</span>
              <span>On</span>
            </button>
            <button
              type="button"
              className={`theme-mode-btn ${!androidNotif.masterEnabled ? 'active' : ''}`}
              onClick={() => onAndroidNotifChange({ masterEnabled: false })}
            >
              <span>○</span>
              <span>Off</span>
            </button>
          </div>
          <p className="theme-help" style={{ marginTop: 12 }}>
            Daily digest (today&apos;s schedule summary and open tasks)
          </p>
          <div className="theme-modes">
            <button
              type="button"
              className={`theme-mode-btn ${androidNotif.digestEnabled ? 'active' : ''}`}
              onClick={() => onAndroidNotifChange({ digestEnabled: true })}
            >
              <span>✓</span>
              <span>Digest on</span>
            </button>
            <button
              type="button"
              className={`theme-mode-btn ${!androidNotif.digestEnabled ? 'active' : ''}`}
              onClick={() => onAndroidNotifChange({ digestEnabled: false })}
            >
              <span>○</span>
              <span>Digest off</span>
            </button>
          </div>
          <label className="theme-label" style={{ display: 'block', marginTop: 12 }}>
            Digest time
          </label>
          <input
            type="time"
            className="input"
            value={androidNotif.digestTime ?? '08:00'}
            onChange={(e) => onAndroidNotifChange({ digestTime: e.target.value })}
            style={{ width: 'auto', marginTop: 8 }}
          />
          <p className="theme-help" style={{ marginTop: 12 }}>
            ~2h check-in (paused 22:00–08:00). Only sent if something is due today, daily progress exists, or a
            schedule template matches tomorrow.
          </p>
          <div className="theme-modes">
            <button
              type="button"
              className={`theme-mode-btn ${androidNotif.periodicDigestEnabled ? 'active' : ''}`}
              onClick={() => onAndroidNotifChange({ periodicDigestEnabled: true })}
            >
              <span>✓</span>
              <span>Check-ins on</span>
            </button>
            <button
              type="button"
              className={`theme-mode-btn ${!androidNotif.periodicDigestEnabled ? 'active' : ''}`}
              onClick={() => onAndroidNotifChange({ periodicDigestEnabled: false })}
            >
              <span>○</span>
              <span>Check-ins off</span>
            </button>
          </div>
        </div>
      )}

      <div className="theme-section">
        <span className="theme-label">Jarvis</span>
        <p className="theme-help">
          Allow Jarvis to create, update, or delete notes and tasks. Chat still works when this is off.
        </p>
        <div className="theme-modes">
          <button
            type="button"
            className={`theme-mode-btn ${settings.aiAgentMutationsEnabled ? 'active' : ''}`}
            onClick={() => onUpdate({ aiAgentMutationsEnabled: true })}
          >
            <span>✓</span>
            <span>Allow edits</span>
          </button>
          <button
            type="button"
            className={`theme-mode-btn ${!settings.aiAgentMutationsEnabled ? 'active' : ''}`}
            onClick={() => onUpdate({ aiAgentMutationsEnabled: false })}
          >
            <span>○</span>
            <span>Chat only</span>
          </button>
        </div>
        <p className="theme-help" style={{ marginTop: 12 }}>
          Jarvis uses Ollama. The API reads <code>OLLAMA_BASE_URL</code> on the server (e.g. ngrok https origin on Railway).
          New to Jarvis? Open the Jarvis tab for setup steps.
        </p>
      </div>

      {onRerunTutorial && (
        <div className="theme-section">
          <span className="theme-label">Guided tour</span>
          <p className="theme-help">Walk through each tab and settings again.</p>
          <button type="button" className="btn btn-full" onClick={() => onRerunTutorial()}>
            Re-run tutorial
          </button>
        </div>
      )}

      <div className="theme-section">
        <span className="theme-label">About</span>
        <p className="theme-help">NoteTasks version <span className="app-version-strong">{APP_VERSION}</span></p>
      </div>
    </div>
  );
}
