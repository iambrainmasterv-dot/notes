import { useState, useMemo, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import type { AssistantWorkContext, Page, ThemeSettings } from './types';
import type { AppUser } from './auth/AuthProvider';
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
import { useNotifications } from './hooks/useNotifications';
import { useAndroidLocalNotifications } from './hooks/useAndroidLocalNotifications';
import { useTick } from './hooks/useTick';
import { NotesPage } from './pages/NotesPage';
import { TasksPage } from './pages/TasksPage';
import { PoolPage } from './pages/PoolPage';
import { SchedulePage } from './pages/SchedulePage';
import { CompletedPage } from './pages/CompletedPage';
import { AssistantPage } from './pages/AssistantPage';
import { ThemePanel } from './components/ThemePanel';
import { useAssistantChat } from './hooks/useAssistantChat';
import { loadJarvisMode, saveJarvisMode, type JarvisMode } from './jarvis/jarvisModeStorage';
import { NotificationBell } from './components/NotificationBell';
import { Toasts } from './components/Toasts';
import { GreetingScreen } from './components/GreetingScreen';
import { useTutorial } from './hooks/useTutorial';
import { TutorialOverlay } from './components/TutorialOverlay';
import { APP_VERSION } from './version';
import { api } from './api/client';
import {
  appCalendarDate,
  collectDescendantIds,
  completedLastEmptyStorageKey,
  countActiveExpiredItems,
  formatLongDate,
  greetingDismissedSessionKey,
  greetingSuppressUntilNextSessionAfterTutorialKey,
  lastVisitAbsenceLine,
  lastVisitStorageKey,
  templatesMatchingAppDay,
  tutorialCompletedStorageKey,
} from './utils';
import {
  loadAndroidNotifSettings,
  mergeAndroidNotifSettings,
  type AndroidNotifUserSettings,
} from './notifications/androidSettings';
import { setAndroidDataSyncCallback } from './notifications/syncBridge';
import { AndroidPinProvider } from './notifications/AndroidPinContext';
import { AssistantJarvisReadyContext } from './context/AssistantJarvisReadyContext';
import { VoidPage } from './pages/VoidPage';
import { HiddenVoidTrigger } from './components/HiddenVoidTrigger';

function isVoidPathname(): boolean {
  if (typeof window === 'undefined') return false;
  const p = window.location.pathname.replace(/\/+$/, '') || '/';
  return p === '/void';
}

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
    key: 'assistant', label: 'Jarvis',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V21l-4-2H9a7 7 0 1 1 3-18z"/><circle cx="9" cy="11" r="0.9" fill="currentColor"/><circle cx="12" cy="11" r="0.9" fill="currentColor"/><circle cx="15" cy="11" r="0.9" fill="currentColor"/></svg>,
  },
  {
    key: 'completed', label: 'Completed',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  },
];

const MOBILE_NAV_MQ = '(max-width: 768px)';

type AppNavSectionsProps = {
  page: Page;
  setPage: (p: Page) => void;
  setNotifOpen: React.Dispatch<React.SetStateAction<boolean>>;
  visibleTabs: typeof tabs;
  completedCount: number;
  activeCount: number;
  dailyCount: number;
  settingsOpen: boolean;
  setSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  settings: ThemeSettings;
  updateTheme: (patch: Partial<ThemeSettings>) => void;
  localImportAvailable: boolean;
  handleImportLocal: () => Promise<void>;
  tutorialRerun: () => void;
  user: AppUser | null;
  isGuest: boolean;
  signOut: () => Promise<void>;
  onNavigate?: () => void;
  androidNotif?: AndroidNotifUserSettings;
  onAndroidNotifChange?: (patch: Partial<AndroidNotifUserSettings>) => void;
};

function AppNavSections({
  page,
  setPage,
  setNotifOpen,
  visibleTabs: navTabs,
  completedCount,
  activeCount,
  dailyCount,
  settingsOpen,
  setSettingsOpen,
  settings,
  updateTheme,
  localImportAvailable,
  handleImportLocal,
  tutorialRerun,
  user,
  isGuest,
  signOut,
  onNavigate,
  androidNotif,
  onAndroidNotifChange,
}: AppNavSectionsProps) {
  const afterPage = () => onNavigate?.();
  return (
    <>
      <ul className="sidebar-nav">
        {navTabs.map((tab) => (
          <li key={tab.key}>
            <button
              type="button"
              className={`nav-item ${page === tab.key ? 'active' : ''}`}
              onClick={() => {
                setPage(tab.key);
                setNotifOpen(false);
                afterPage();
              }}
              data-tutorial-target={tab.key === 'assistant' ? 'nav-jarvis' : undefined}
            >
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
        <div className="sidebar-bottom-row">
          <button
            type="button"
            className={`nav-item ${settingsOpen ? 'active' : ''}`}
            onClick={() => setSettingsOpen((p) => !p)}
            data-tutorial-target="nav-settings"
          >
            <span className="nav-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </span>
            <span className="nav-label">Settings</span>
          </button>
        </div>
        {settingsOpen && (
          <ThemePanel
            settings={settings}
            onUpdate={updateTheme}
            localImportAvailable={localImportAvailable}
            onImportLocal={handleImportLocal}
            onRerunTutorial={tutorialRerun}
            androidNotif={androidNotif}
            onAndroidNotifChange={onAndroidNotifChange}
          />
        )}

        <div className="sidebar-user">
          <span className="user-email" title={isGuest ? 'Guest (local only)' : (user?.email ?? '')}>
            {isGuest ? 'Guest — local only' : (user?.email ?? '')}
          </span>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => {
              void signOut();
              onNavigate?.();
            }}
          >
            {isGuest ? 'Exit guest' : 'Sign Out'}
          </button>
        </div>

        <div className="sidebar-version" aria-hidden>
          <span className="app-version-pill">v{APP_VERSION}</span>
        </div>
      </div>
    </>
  );
}

export default function App() {
  const { user, isGuest, loading, signOut } = useAuth();
  const [, setPathRev] = useState(0);

  useEffect(() => {
    const bump = () => setPathRev((x) => x + 1);
    window.addEventListener('popstate', bump);
    window.addEventListener('notetasks-nav', bump);
    return () => {
      window.removeEventListener('popstate', bump);
      window.removeEventListener('notetasks-nav', bump);
    };
  }, []);

  if (isVoidPathname()) {
    return <VoidPage />;
  }

  if (loading) {
    return (
      <>
        <div className="login-page">
          <div className="login-card" style={{ textAlign: 'center' }}>
            <div className="brand-mark">N</div>
            <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>Loading…</p>
            <p className="login-version" style={{ marginTop: 16 }}>v{APP_VERSION}</p>
          </div>
        </div>
        <HiddenVoidTrigger />
      </>
    );
  }

  if (!user && !isGuest) {
    return (
      <>
        <LoginPage />
        <HiddenVoidTrigger />
      </>
    );
  }

  return (
    <>
      <AuthenticatedApp signOut={signOut} />
      <HiddenVoidTrigger />
    </>
  );
}

function AuthenticatedApp({ signOut }: { signOut: () => Promise<void> }) {
  const { user, isGuest } = useAuth();
  const [page, setPageInternal] = useState<Page>('pool');
  const setPage = useCallback((next: Page | ((prev: Page) => Page)) => {
    setPageInternal(next);
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { notes, addNote, updateNote, recoverNote, setNotes, refetch: refetchNotes } = useNotes();
  const { tasks, addTask, updateTask, recoverTask, setTasks, refetch: refetchTasks } = useTasks();
  const { settings, update: updateTheme, lastResetTag, saveResetTag } = useUserSettings();
  useThemeApply(settings);
  const { presets, addPreset, updatePreset, deletePreset } = usePresets();

  useDailyReset({ dailyResetTime: settings.dailyResetTime, setNotes, setTasks, lastResetTag, saveResetTag });

  const {
    templates: scheduleTemplates,
    addTemplate: addScheduleTemplate,
    deleteTemplate: deleteScheduleTemplate,
    refetch: refetchScheduleTemplates,
  } = useScheduleTemplates();
  useScheduleTemplateSync({
    dailyResetTime: settings.dailyResetTime,
    lastResetTag,
    templates: scheduleTemplates,
    setNotes,
    setTasks,
    enabled: !isGuest,
  });

  const { hasLocalData, importLocalData } = useLocalImport();
  const [localImportAvailable, setLocalImportAvailable] = useState(false);
  const userId = user?.id ?? (isGuest ? 'guest' : '');

  const refreshLocalFlag = useCallback(() => {
    setLocalImportAvailable(hasLocalData());
  }, [hasLocalData]);

  useEffect(() => {
    refreshLocalFlag();
  }, [refreshLocalFlag, user?.id]);

  useEffect(() => {
    if (settingsOpen) refreshLocalFlag();
  }, [settingsOpen, refreshLocalFlag]);

  const handleImportLocal = async () => {
    if (!window.confirm('Import local notes and tasks into your account? Local copies will be removed after import.')) return;
    await importLocalData();
    refreshLocalFlag();
    window.location.reload();
  };

  const activeForTick = useMemo(
    () => [...notes.filter((n) => !n.completed), ...tasks.filter((t) => !t.completed)],
    [notes, tasks],
  );
  const nearestDeadline = useMemo(() => {
    const ds = activeForTick.filter((i) => i.deadline).map((i) => i.deadline!).sort();
    return ds[0];
  }, [activeForTick]);
  const now = useTick(nearestDeadline);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
    const goPool = () => setPage('pool');
    window.addEventListener('notetasksOpenPool', goPool);
    return () => window.removeEventListener('notetasksOpenPool', goPool);
  }, [setPage]);

  const completedCount = useMemo(
    () => notes.filter((n) => n.completed).length + tasks.filter((t) => t.completed).length,
    [notes, tasks],
  );

  const [lastCompletedEmptyAtMs, setLastCompletedEmptyAtMs] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    const k = completedLastEmptyStorageKey(userId);
    if (completedCount === 0) {
      const t = Date.now();
      localStorage.setItem(k, String(t));
      setLastCompletedEmptyAtMs(t);
      return;
    }
    const raw = localStorage.getItem(k);
    if (raw && !Number.isNaN(Number(raw))) {
      setLastCompletedEmptyAtMs(Number(raw));
    } else {
      const t = Date.now();
      localStorage.setItem(k, String(t));
      setLastCompletedEmptyAtMs(t);
    }
  }, [completedCount, userId]);

  const staleCompletedParams = useMemo(
    () =>
      userId
        ? { userId, completedCount, lastCompletedEmptyAtMs }
        : null,
    [userId, completedCount, lastCompletedEmptyAtMs],
  );

  const {
    notifications,
    unreadCount,
    toasts,
    dismissToast,
    markRead,
    markAllRead,
  } = useNotifications(notes, tasks, now, staleCompletedParams);

  const [androidNotif, setAndroidNotif] = useState(() => loadAndroidNotifSettings());
  const patchAndroidNotif = useCallback((p: Partial<AndroidNotifUserSettings>) => {
    setAndroidNotif((prev) => mergeAndroidNotifSettings(p, prev));
  }, []);

  const isAndroidApp = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  const [pinsRevision, setPinsRevision] = useState(0);
  const bumpPinsRevision = useCallback(() => setPinsRevision((n) => n + 1), []);

  useAndroidLocalNotifications({
    notes,
    tasks,
    now,
    staleCompleted: staleCompletedParams,
    userId: userId || null,
    scheduleTemplates,
    dailyResetTime: settings.dailyResetTime,
    androidNotif,
    pinsRevision,
  });

  useEffect(() => {
    setAndroidDataSyncCallback(() => {
      void refetchNotes();
      void refetchTasks();
    });
    return () => setAndroidDataSyncCallback(null);
  }, [refetchNotes, refetchTasks]);

  const activeCount = useMemo(
    () => notes.filter((n) => !n.completed).length + tasks.filter((t) => !t.completed).length,
    [notes, tasks],
  );

  const dailyCount = useMemo(
    () => notes.filter((n) => n.daily).length + tasks.filter((t) => t.daily).length,
    [notes, tasks],
  );

  const [greetingOpen, setGreetingOpen] = useState(false);

  const [openCreateNoteNonce, setOpenCreateNoteNonce] = useState(0);
  const [openCreateTaskNonce, setOpenCreateTaskNonce] = useState(0);

  useEffect(() => {
    if (page !== 'notes') setOpenCreateNoteNonce(0);
    if (page !== 'tasks') setOpenCreateTaskNonce(0);
  }, [page]);

  const [assistantAvailable, setAssistantAvailable] = useState<boolean | null>(null);
  const [ollamaSuggestedModel, setOllamaSuggestedModel] = useState('llama3.2');
  const [ollamaCloudLoopbackHint, setOllamaCloudLoopbackHint] = useState<string | undefined>(undefined);
  const [ollamaCheckPending, setOllamaCheckPending] = useState(false);

  const checkAssistantAvailability = useCallback(async () => {
    setOllamaCheckPending(true);
    try {
      const r = await api.getAssistantAvailability();
      setAssistantAvailable(r.available);
      setOllamaSuggestedModel(r.suggestedModel);
      setOllamaCloudLoopbackHint(r.cloudLoopbackHint);
    } finally {
      setOllamaCheckPending(false);
    }
  }, []);

  useEffect(() => {
    void checkAssistantAvailability();
    const id = window.setInterval(() => {
      void checkAssistantAvailability();
    }, 60_000);
    const onFocus = () => {
      void checkAssistantAvailability();
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') void checkAssistantAvailability();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [checkAssistantAvailability]);

  const visibleTabs = tabs;

  const refetchWorkspace = useCallback(() => {
    refetchNotes();
    refetchTasks();
    refetchScheduleTemplates();
  }, [refetchNotes, refetchTasks, refetchScheduleTemplates]);

  useEffect(() => {
    if (isGuest) return;
    const onOnline = () => refetchWorkspace();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [isGuest, refetchWorkspace]);

  const handleAssistantWorkContext = useCallback((ctx: AssistantWorkContext | null) => {
    if (!ctx) return;
    setPage(ctx);
    setNotifOpen(false);
  }, [setPage]);

  const [jarvisMode, setJarvisMode] = useState<JarvisMode>(() => loadJarvisMode());
  const setJarvisModePersist = useCallback((mode: JarvisMode) => {
    setJarvisMode(mode);
    saveJarvisMode(mode);
  }, []);

  const assistantChat = useAssistantChat({
    jarvisMode,
    onWorkContext: handleAssistantWorkContext,
    onDataChanged: refetchWorkspace,
  });

  const assistantPanelProps = {
    jarvisMode,
    onJarvisModeChange: setJarvisModePersist,
    messages: assistantChat.messages,
    loading: assistantChat.loading,
    error: assistantChat.error,
    onSend: assistantChat.send,
    onAcceptProposal: assistantChat.acceptProposal,
    onDenyProposal: assistantChat.denyProposal,
    onRedoProposal: assistantChat.redoProposal,
    onDismissError: () => assistantChat.setError(null),
    ollamaAvailable: isGuest ? false : assistantAvailable,
    ollamaCheckPending,
    ollamaSuggestedModel,
    ollamaCloudLoopbackHint,
    onRecheckOllama: checkAssistantAvailability,
    guestMode: isGuest,
  };

  const tutorial = useTutorial(userId, setPage, setSettingsOpen, notes.length, tasks.length);

  const [narrowNav, setNarrowNav] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_NAV_MQ).matches,
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const m = window.matchMedia(MOBILE_NAV_MQ);
    const apply = () => setNarrowNav(m.matches);
    apply();
    m.addEventListener('change', apply);
    return () => m.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!tutorial.active || !narrowNav) return;
    const targets = tutorial.step.highlightTargets;
    if (targets?.some((t) => t.startsWith('nav-'))) {
      setMobileNavOpen(true);
    }
  }, [tutorial.active, tutorial.step, narrowNav, tutorial.stepIndex]);

  const navSectionProps: AppNavSectionsProps = {
    page,
    setPage,
    setNotifOpen,
    visibleTabs,
    completedCount,
    activeCount,
    dailyCount,
    settingsOpen,
    setSettingsOpen,
    settings,
    updateTheme,
    localImportAvailable,
    handleImportLocal,
    tutorialRerun: tutorial.rerun,
    user,
    isGuest,
    signOut,
    androidNotif: isAndroidApp ? androidNotif : undefined,
    onAndroidNotifChange: isAndroidApp ? patchAndroidNotif : undefined,
  };

  const tutorialMarkedComplete = useMemo(() => {
    if (!userId || typeof localStorage === 'undefined') return false;
    return localStorage.getItem(tutorialCompletedStorageKey(userId)) === '1';
  }, [userId, tutorial.active]);

  useEffect(() => {
    if (!userId || typeof sessionStorage === 'undefined') {
      setGreetingOpen(false);
      return;
    }
    if (!tutorialMarkedComplete) {
      setGreetingOpen(false);
      return;
    }
    if (sessionStorage.getItem(greetingSuppressUntilNextSessionAfterTutorialKey(userId)) === '1') {
      setGreetingOpen(false);
      return;
    }
    const dismissed = sessionStorage.getItem(greetingDismissedSessionKey(userId)) === '1';
    setGreetingOpen(!dismissed);
  }, [userId, tutorialMarkedComplete]);

  const lastVisitAtMs = useMemo(() => {
    if (!userId || typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(lastVisitStorageKey(userId));
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [userId]);

  const greetingTodayLabel = useMemo(
    () => formatLongDate(appCalendarDate(settings.dailyResetTime)),
    [settings.dailyResetTime],
  );

  const greetingLastVisitLine = useMemo(
    () => lastVisitAbsenceLine(lastVisitAtMs, now, 1),
    [lastVisitAtMs, now],
  );

  const greetingExpiredCount = useMemo(
    () => countActiveExpiredItems(notes, tasks, now),
    [notes, tasks, now],
  );

  const greetingTemplatesToday = useMemo(
    () => templatesMatchingAppDay(scheduleTemplates, settings.dailyResetTime),
    [scheduleTemplates, settings.dailyResetTime],
  );

  const deleteNoteCascade = useCallback(
    (id: string) => {
      const { noteIds, taskIds } = collectDescendantIds('note', id, notes, tasks);
      const nDel = new Set([id, ...noteIds]);
      const tDel = new Set(taskIds);
      setNotes((prev) => prev.filter((n) => !nDel.has(n.id)));
      setTasks((prev) => prev.filter((t) => !tDel.has(t.id)));
      if (nDel.size === 1) {
        nDel.forEach((nid) => api.deleteNote(nid).catch(() => {}));
      } else {
        api.deleteNotes([...nDel]).catch(() => {});
      }
      tDel.forEach((tid) => api.deleteTask(tid).catch(() => {}));
    },
    [notes, tasks, setNotes, setTasks],
  );

  const deleteTaskCascade = useCallback(
    (id: string) => {
      const { noteIds, taskIds } = collectDescendantIds('task', id, notes, tasks);
      const nDel = new Set(noteIds);
      const tDel = new Set([id, ...taskIds]);
      setNotes((prev) => prev.filter((n) => !nDel.has(n.id)));
      setTasks((prev) => prev.filter((t) => !tDel.has(t.id)));
      if (nDel.size > 0) {
        api.deleteNotes([...nDel]).catch(() => {});
      }
      tDel.forEach((tid) => api.deleteTask(tid).catch(() => {}));
    },
    [notes, tasks, setNotes, setTasks],
  );

  const bulkDeleteByIds = useCallback(
    (ids: string[]) => {
      const allNoteDel = new Set<string>();
      const allTaskDel = new Set<string>();
      for (const id of ids) {
        const n = notes.find((x) => x.id === id);
        const t = tasks.find((x) => x.id === id);
        if (n) {
          const { noteIds, taskIds } = collectDescendantIds('note', id, notes, tasks);
          allNoteDel.add(id);
          noteIds.forEach((i) => allNoteDel.add(i));
          taskIds.forEach((i) => allTaskDel.add(i));
        } else if (t) {
          const { noteIds, taskIds } = collectDescendantIds('task', id, notes, tasks);
          noteIds.forEach((i) => allNoteDel.add(i));
          taskIds.forEach((i) => allTaskDel.add(i));
          allTaskDel.add(id);
        }
      }
      setNotes((prev) => prev.filter((n) => !allNoteDel.has(n.id)));
      setTasks((prev) => prev.filter((t) => !allTaskDel.has(t.id)));
      if (allNoteDel.size === 1) {
        allNoteDel.forEach((nid) => api.deleteNote(nid).catch(() => {}));
      } else if (allNoteDel.size > 0) {
        api.deleteNotes([...allNoteDel]).catch(() => {});
      }
      allTaskDel.forEach((tid) => api.deleteTask(tid).catch(() => {}));
    },
    [notes, tasks, setNotes, setTasks],
  );

  const completeNoteCascade = useCallback(
    (id: string) => {
      const ts = new Date().toISOString();
      const { noteIds, taskIds } = collectDescendantIds('note', id, notes, tasks);
      const nIds = new Set([id, ...noteIds]);
      const tIds = new Set(taskIds);
      setNotes((prev) => prev.map((n) => (nIds.has(n.id) ? { ...n, completed: true, completedAt: ts } : n)));
      setTasks((prev) => prev.map((t) => (tIds.has(t.id) ? { ...t, completed: true, completedAt: ts } : t)));
      nIds.forEach((nid) => api.updateNote(nid, { completed: true, completed_at: ts }).catch(() => {}));
      tIds.forEach((tid) => api.updateTask(tid, { completed: true, completed_at: ts }).catch(() => {}));
    },
    [notes, tasks, setNotes, setTasks],
  );

  const completeTaskCascade = useCallback(
    (id: string) => {
      const ts = new Date().toISOString();
      const { noteIds, taskIds } = collectDescendantIds('task', id, notes, tasks);
      const nIds = new Set(noteIds);
      const tIds = new Set([id, ...taskIds]);
      setNotes((prev) => prev.map((n) => (nIds.has(n.id) ? { ...n, completed: true, completedAt: ts } : n)));
      setTasks((prev) => prev.map((t) => (tIds.has(t.id) ? { ...t, completed: true, completedAt: ts } : t)));
      nIds.forEach((nid) => api.updateNote(nid, { completed: true, completed_at: ts }).catch(() => {}));
      tIds.forEach((tid) => api.updateTask(tid, { completed: true, completed_at: ts }).catch(() => {}));
    },
    [notes, tasks, setNotes, setTasks],
  );

  const handleGreetingDismiss = useCallback(() => {
    if (userId && typeof localStorage !== 'undefined') {
      localStorage.setItem(lastVisitStorageKey(userId), String(Date.now()));
    }
    if (userId && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(greetingDismissedSessionKey(userId), '1');
    }
    setGreetingOpen(false);
  }, [userId]);

  const assistantJarvisReady = Boolean(!isGuest && assistantAvailable === true);

  return (
    <AssistantJarvisReadyContext.Provider value={assistantJarvisReady}>
    <AndroidPinProvider enabled={isAndroidApp} onPinsChanged={bumpPinsRevision}>
    <div className="app">
      <GreetingScreen
        open={greetingOpen}
        onGetToWork={handleGreetingDismiss}
        todayLabel={greetingTodayLabel}
        lastVisitLine={greetingLastVisitLine}
        expiredCount={greetingExpiredCount}
        templatesToday={greetingTemplatesToday}
      />

      <Toasts toasts={toasts} onDismiss={dismissToast} />

      <TutorialOverlay
        open={tutorial.active}
        step={tutorial.step}
        stepIndex={tutorial.stepIndex}
        total={tutorial.total}
        onNext={tutorial.next}
        onSkipTab={tutorial.skipToNextTab}
        onFinish={tutorial.finish}
        isLast={tutorial.isLast}
        canGoNext={tutorial.canGoNext}
        showSkipToNextTab={tutorial.showSkipToNextTab}
        interactive={tutorial.interactive}
        gateHint={tutorial.gateHint}
      />

      {narrowNav && (
        <>
          <header className="app-mobile-header">
            <button
              type="button"
              className="app-mobile-menu-btn"
              aria-label="Open menu"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((o) => !o)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </svg>
            </button>
            <div className="app-mobile-header-brand">
              <div className="brand-mark">N</div>
              <span className="brand-text">NoteTasks</span>
            </div>
            <div className={`notif-bell-wrap ${notifOpen ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
              <NotificationBell
                unreadCount={unreadCount}
                panelOpen={notifOpen}
                onTogglePanel={() => setNotifOpen((o) => !o)}
                notifications={notifications}
                onMarkRead={markRead}
                onMarkAllRead={markAllRead}
              />
            </div>
          </header>

          {mobileNavOpen && (
            <>
              <div
                className="app-nav-drawer-backdrop"
                aria-hidden
                onClick={() => setMobileNavOpen(false)}
              />
              <aside
                className={`app-nav-drawer-panel ${mobileNavOpen ? 'is-open' : ''}`}
                role="dialog"
                aria-modal="true"
                aria-label="Navigation"
              >
                <div className="app-nav-drawer-top">
                  <span className="app-nav-drawer-title">Menu</span>
                  <button
                    type="button"
                    className="app-nav-drawer-close btn btn-sm btn-ghost"
                    aria-label="Close menu"
                    onClick={() => setMobileNavOpen(false)}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                <div className="app-nav-drawer-scroll">
                  <AppNavSections
                    {...navSectionProps}
                    onNavigate={() => setMobileNavOpen(false)}
                  />
                </div>
              </aside>
            </>
          )}
        </>
      )}

      <nav className="sidebar app-sidebar-desktop" aria-hidden={narrowNav}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-text">
            <div className="brand-mark">N</div>
            <span className="brand-text">NoteTasks</span>
          </div>
          <div className={`notif-bell-wrap ${notifOpen ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
            <NotificationBell
              unreadCount={unreadCount}
              panelOpen={notifOpen}
              onTogglePanel={() => setNotifOpen((o) => !o)}
              notifications={notifications}
              onMarkRead={markRead}
              onMarkAllRead={markAllRead}
            />
          </div>
        </div>

        <AppNavSections {...navSectionProps} />
      </nav>

      <div className="app-main-row">
      <main className="main-content" onClick={() => setNotifOpen(false)}>
        <div key={page} className="main-page-enter">
          {page === 'assistant' && <AssistantPage {...assistantPanelProps} />}
          {page === 'pool' && (
            <PoolPage notes={notes} tasks={tasks}
              addNote={addNote} addTask={addTask}
              updateNote={updateNote} updateTask={updateTask}
              deleteNote={deleteNoteCascade} deleteTask={deleteTaskCascade}
              completeNote={completeNoteCascade} completeTask={completeTaskCascade}
              onPoolQuickCreateNote={() => { setPage('notes'); setOpenCreateNoteNonce((n) => n + 1); }}
              onPoolQuickCreateTask={() => { setPage('tasks'); setOpenCreateTaskNonce((n) => n + 1); }}
            />
          )}
          {page === 'schedule' && (
            <SchedulePage
              notes={notes} tasks={tasks}
              addNote={addNote} addTask={addTask}
              updateNote={updateNote} updateTask={updateTask}
              deleteNote={deleteNoteCascade} deleteTask={deleteTaskCascade}
              completeNote={completeNoteCascade} completeTask={completeTaskCascade}
              setNotes={setNotes} setTasks={setTasks}
              presets={presets} addPreset={addPreset}
              updatePreset={updatePreset} deletePreset={deletePreset}
              scheduleTemplates={scheduleTemplates}
              addScheduleTemplate={addScheduleTemplate}
              deleteScheduleTemplate={deleteScheduleTemplate}
            />
          )}
          {page === 'notes' && (
            <NotesPage
              notes={notes}
              tasks={tasks}
              openCreateNonce={openCreateNoteNonce}
              addNote={addNote}
              addTask={addTask}
              updateNote={updateNote}
              updateTask={updateTask}
              deleteNote={deleteNoteCascade}
              deleteTask={deleteTaskCascade}
              completeNote={completeNoteCascade}
              completeTask={completeTaskCascade}
            />
          )}
          {page === 'tasks' && (
            <TasksPage
              notes={notes}
              tasks={tasks}
              openCreateNonce={openCreateTaskNonce}
              addNote={addNote}
              addTask={addTask}
              updateNote={updateNote}
              updateTask={updateTask}
              deleteNote={deleteNoteCascade}
              deleteTask={deleteTaskCascade}
              completeNote={completeNoteCascade}
              completeTask={completeTaskCascade}
            />
          )}
          {page === 'completed' && (
            <CompletedPage
              notes={notes}
              tasks={tasks}
              recoverNote={recoverNote}
              recoverTask={recoverTask}
              deleteNote={deleteNoteCascade}
              deleteTask={deleteTaskCascade}
              bulkDeleteByIds={bulkDeleteByIds}
            />
          )}
        </div>
      </main>
      </div>
    </div>
    </AndroidPinProvider>
    </AssistantJarvisReadyContext.Provider>
  );
}
