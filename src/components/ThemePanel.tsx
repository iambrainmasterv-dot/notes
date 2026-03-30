import { LocalNotifications } from '@capacitor/local-notifications';
import type { ThemeMode, AccentColor, UIScale, FontScale, ThemeSettings } from '../types';
import type { AndroidNotifUserSettings } from '../notifications/androidSettings';
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

      {androidNotif && onAndroidNotifChange && (
        <div className="theme-section">
          <span className="theme-label">Android notifications</span>
          <p className="theme-help">
            Local push reminders before deadlines (24h, 6h, 1h, 15m, and at due), optional daily digest, and pinned
            items. Requires
            notification permission.
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
