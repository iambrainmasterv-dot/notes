import { useState, useMemo, useEffect } from 'react';
import type { Page } from './types';
import { useAuth } from './auth/AuthProvider';
import { LoginPage } from './pages/LoginPage';
import { useNotes } from './hooks/useNotes';
import { useTasks } from './hooks/useTasks';
import { useUserSettings } from './hooks/useUserSettings';
import { useThemeApply } from './hooks/useTheme';
import { usePresets } from './hooks/usePresets';
import { useDailyReset } from './hooks/useDailyReset';
import { useScheduleTemplates } from './hooks/useScheduleTemplates';
import { useScheduleTemplateSync } from './hooks/useScheduleTemplateSync';
import { useLocalImport } from './hooks/useLocalImport';
import { NotesPage } from './pages/NotesPage';
import { TasksPage } from './pages/TasksPage';
import { PoolPage } from './pages/PoolPage';
import { SchedulePage } from './pages/SchedulePage';
import { CompletedPage } from './pages/CompletedPage';
import { ThemePanel } from './components/ThemePanel';
import { Modal } from './components/Modal';

const tabs: { key: Page; label: string; icon: React.ReactNode }[] = [
  {
    key: 'pool', label: 'Pool',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  },
  {
    key: 'schedule', label: 'Schedule',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>,
  },
  {
    key: 'notes', label: 'Notes',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  },
  {
    key: 'tasks', label: 'Tasks',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  },
  {
    key: 'completed', label: 'Completed',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  },
];

export default function App() {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="login-page">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <div className="brand-mark">N</div>
          <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return <AuthenticatedApp signOut={signOut} />;
}

function AuthenticatedApp({ signOut }: { signOut: () => Promise<void> }) {
  const { user } = useAuth();
  const [page, setPage] = useState<Page>('pool');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { notes, addNote, updateNote, deleteNote, completeNote, recoverNote, setNotes } = useNotes();
  const { tasks, addTask, updateTask, deleteTask, completeTask, recoverTask, setTasks } = useTasks();
  const { settings, update: updateTheme, lastResetTag, saveResetTag } = useUserSettings();
  useThemeApply(settings);
  const { presets, addPreset, updatePreset, deletePreset } = usePresets();

  useDailyReset({ dailyResetTime: settings.dailyResetTime, setNotes, setTasks, lastResetTag, saveResetTag });

  const { templates: scheduleTemplates, addTemplate: addScheduleTemplate, deleteTemplate: deleteScheduleTemplate } = useScheduleTemplates();
  useScheduleTemplateSync({ dailyResetTime: settings.dailyResetTime, lastResetTag, templates: scheduleTemplates, setNotes, setTasks });

  const { hasLocalData, importLocalData } = useLocalImport();
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    if (hasLocalData()) setShowImport(true);
  }, [hasLocalData]);

  const handleImport = async () => {
    await importLocalData();
    setShowImport(false);
    window.location.reload();
  };

  const completedCount = useMemo(
    () => notes.filter((n) => n.completed).length + tasks.filter((t) => t.completed).length,
    [notes, tasks],
  );

  const activeCount = useMemo(
    () => notes.filter((n) => !n.completed).length + tasks.filter((t) => !t.completed).length,
    [notes, tasks],
  );

  const dailyCount = useMemo(
    () => notes.filter((n) => n.daily).length + tasks.filter((t) => t.daily).length,
    [notes, tasks],
  );

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">N</div>
          <span className="brand-text">NoteTasks</span>
        </div>

        <ul className="sidebar-nav">
          {tabs.map((tab) => (
            <li key={tab.key}>
              <button className={`nav-item ${page === tab.key ? 'active' : ''}`} onClick={() => setPage(tab.key)}>
                <span className="nav-icon">{tab.icon}</span>
                <span className="nav-label">{tab.label}</span>
                {tab.key === 'completed' && completedCount > 0 && (
                  <span className="nav-badge">{completedCount}</span>
                )}
                {tab.key === 'pool' && activeCount > 0 && (
                  <span className="nav-badge">{activeCount}</span>
                )}
                {tab.key === 'schedule' && dailyCount > 0 && (
                  <span className="nav-badge">{dailyCount}</span>
                )}
              </button>
            </li>
          ))}
        </ul>

        <div className="sidebar-bottom">
          <button className={`nav-item ${settingsOpen ? 'active' : ''}`} onClick={() => setSettingsOpen((p) => !p)}>
            <span className="nav-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </span>
            <span className="nav-label">Settings</span>
          </button>
          {settingsOpen && <ThemePanel settings={settings} onUpdate={updateTheme} />}

          <div className="sidebar-user">
            <span className="user-email" title={user?.email ?? ''}>{user?.email ?? ''}</span>
            <button className="btn btn-sm btn-ghost" onClick={signOut}>Sign Out</button>
          </div>
        </div>
      </nav>

      <main className="main-content">
        {page === 'pool' && (
          <PoolPage notes={notes} tasks={tasks}
            updateNote={updateNote} updateTask={updateTask}
            deleteNote={deleteNote} deleteTask={deleteTask}
            completeNote={completeNote} completeTask={completeTask} />
        )}
        {page === 'schedule' && (
          <SchedulePage
            notes={notes} tasks={tasks}
            addNote={addNote} addTask={addTask}
            updateNote={updateNote} updateTask={updateTask}
            deleteNote={deleteNote} deleteTask={deleteTask}
            completeNote={completeNote} completeTask={completeTask}
            setNotes={setNotes} setTasks={setTasks}
            presets={presets} addPreset={addPreset}
            updatePreset={updatePreset} deletePreset={deletePreset}
            scheduleTemplates={scheduleTemplates}
            addScheduleTemplate={addScheduleTemplate}
            deleteScheduleTemplate={deleteScheduleTemplate}
          />
        )}
        {page === 'notes' && (
          <NotesPage notes={notes} addNote={addNote} updateNote={updateNote} deleteNote={deleteNote} completeNote={completeNote} />
        )}
        {page === 'tasks' && (
          <TasksPage tasks={tasks} addTask={addTask} updateTask={updateTask} deleteTask={deleteTask} completeTask={completeTask} />
        )}
        {page === 'completed' && (
          <CompletedPage notes={notes} tasks={tasks} recoverNote={recoverNote} recoverTask={recoverTask}
            deleteNote={deleteNote} deleteTask={deleteTask} setNotes={setNotes} setTasks={setTasks} />
        )}
      </main>

      <Modal open={showImport} onClose={() => setShowImport(false)} title="Import Local Data">
        <p className="card-desc">
          We found notes and tasks saved locally on this device. Would you like to import them into your account?
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn" onClick={() => setShowImport(false)}>Skip</button>
          <button className="btn btn-primary" onClick={handleImport}>Import</button>
        </div>
      </Modal>
    </div>
  );
}
