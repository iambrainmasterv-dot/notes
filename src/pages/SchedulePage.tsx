import { useState, useMemo, useRef } from 'react';
import type { Note, Task, Item, ViewMode, SortField, SortDir, Preset, PresetItem, ScheduleTemplate, ScheduleKind, Weekday, ScheduleRules } from '../types';
import type { NewScheduleTemplateData } from '../hooks/useScheduleTemplates';
import { NoteCard } from '../components/NoteCard';
import { ItemOriginBadges } from '../components/ItemOriginBadges';
import { TaskCard } from '../components/TaskCard';
import { Modal } from '../components/Modal';
import { DeadlinePicker } from '../components/DeadlinePicker';
import { SearchBar } from '../components/SearchBar';
import { SortControls } from '../components/SortControls';
import { DeadlineBadge } from '../components/DeadlineBadge';
import { ProgressBar } from '../components/ProgressBar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { isExpired, itemOriginRowClass, itemShownAsRootInFiltered, buildParentPickerOptions, parseParentPickerValue } from '../utils';
import { useTick } from '../hooks/useTick';

const WEEKDAY_LABELS: { value: Weekday; label: string }[] = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
];

function emptyWeekdayPick(): Record<Weekday, boolean> {
  const o = {} as Record<Weekday, boolean>;
  for (const { value } of WEEKDAY_LABELS) o[value] = false;
  return o;
}

interface DraftItem {
  key: string;
  type: 'note' | 'task';
  title: string;
  description: string;
  deadlineTime: string;
  target: number;
}

function emptyDraft(): DraftItem {
  return { key: crypto.randomUUID(), type: 'task', title: '', description: '', deadlineTime: '', target: 10 };
}

interface Props {
  notes: Note[];
  tasks: Task[];
  addNote: (data: Omit<Note, 'id' | 'type' | 'completed' | 'createdAt'>) => void;
  addTask: (data: Omit<Task, 'id' | 'type' | 'completed' | 'createdAt' | 'progress'>) => void;
  updateNote: (id: string, patch: Partial<Note>) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteNote: (id: string) => void;
  deleteTask: (id: string) => void;
  completeNote: (id: string) => void;
  completeTask: (id: string) => void;
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  presets: Preset[];
  addPreset: (name: string, items: PresetItem[]) => Preset;
  updatePreset: (id: string, patch: Partial<Omit<Preset, 'id'>>) => void;
  deletePreset: (id: string) => void;
  scheduleTemplates: ScheduleTemplate[];
  addScheduleTemplate: (data: NewScheduleTemplateData) => Promise<ScheduleTemplate>;
  deleteScheduleTemplate: (id: string) => Promise<void>;
}

export function SchedulePage({
  notes, tasks, addNote, addTask, updateNote, updateTask,
  deleteNote, deleteTask, completeNote, completeTask,
  setNotes, setTasks,
  presets, addPreset, updatePreset, deletePreset,
  scheduleTemplates, addScheduleTemplate, deleteScheduleTemplate,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Daily Note/Task creation modals
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [nTitle, setNTitle] = useState('');
  const [nDesc, setNDesc] = useState('');
  const [nDeadline, setNDeadline] = useState<string | undefined>();
  const [tTitle, setTTitle] = useState('');
  const [tDesc, setTDesc] = useState('');
  const [tTarget, setTTarget] = useState(10);
  const [tDeadline, setTDeadline] = useState<string | undefined>();
  const [nParentVal, setNParentVal] = useState('');
  const [tParentVal, setTParentVal] = useState('');

  // Schedule template builder (big modal)
  const [builderOpen, setBuilderOpen] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([emptyDraft()]);

  // Schedule template confirm (small modal)
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplDesc, setTplDesc] = useState('');
  const [scheduleMode, setScheduleMode] = useState<ScheduleKind>('none');
  const [weekdayPick, setWeekdayPick] = useState<Record<Weekday, boolean>>(() => emptyWeekdayPick());
  const [monthDays, setMonthDays] = useState<Set<number>>(new Set());
  const [moreDates, setMoreDates] = useState<string[]>([]);
  const [morePick, setMorePick] = useState('');

  const [confirmDeleteTpl, setConfirmDeleteTpl] = useState<string | null>(null);
  const [expandedTpl, setExpandedTpl] = useState<string | null>(null);

  // Preset modals
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [confirmDeletePreset, setConfirmDeletePreset] = useState<string | null>(null);
  const [warnUnsaved, setWarnUnsaved] = useState(false);
  const [pendingApplyId, setPendingApplyId] = useState<string | null>(null);
  const [expandedPreset, setExpandedPreset] = useState<string | null>(null);
  const [editPresetId, setEditPresetId] = useState<string | null>(null);
  const [editPresetName, setEditPresetName] = useState('');

  const [tableDeleteId, setTableDeleteId] = useState<{ id: string; type: 'note' | 'task' } | null>(null);

  // Old-style daily items (the `daily` flag on notes/tasks)
  const dailyNotes = useMemo(() => notes.filter((n) => n.daily), [notes]);
  const dailyTasks = useMemo(() => tasks.filter((t) => t.daily), [tasks]);
  const dailyNotesActive = useMemo(() => dailyNotes.filter((n) => !n.completed), [dailyNotes]);
  const dailyTasksActive = useMemo(() => dailyTasks.filter((t) => !t.completed), [dailyTasks]);
  const dailyParentOpts = useMemo(
    () => buildParentPickerOptions(dailyNotesActive, dailyTasksActive, { dailyOnly: true }),
    [dailyNotesActive, dailyTasksActive],
  );
  const allDailyItems: Item[] = useMemo(
    () => [...dailyNotes, ...dailyTasks],
    [dailyNotes, dailyTasks],
  );

  const nearestDeadline = useMemo(() => {
    const upcoming = allDailyItems.filter((i) => i.deadline && !i.completed).map((i) => i.deadline!).sort();
    return upcoming[0];
  }, [allDailyItems]);
  const now = useTick(nearestDeadline);

  const filtered = useMemo(() => {
    let result = allDailyItems;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) => i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q),
      );
    }
    return [...result].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      if (sortField === 'title') { aVal = a.title.toLowerCase(); bVal = b.title.toLowerCase(); }
      else if (sortField === 'deadline') { aVal = a.deadline ?? ''; bVal = b.deadline ?? ''; }
      else if (sortField === 'type') { aVal = a.type; bVal = b.type; }
      else if (sortField === 'progress') {
        aVal = a.type === 'task' ? ((a as Task).target > 0 ? (a as Task).progress / (a as Task).target : 0) : -1;
        bVal = b.type === 'task' ? ((b as Task).target > 0 ? (b as Task).progress / (b as Task).target : 0) : -1;
      }
      else { aVal = a.createdAt; bVal = b.createdAt; }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [allDailyItems, search, sortField, sortDir]);

  const visibleFiltered = useMemo(() => {
    const ids = new Set(filtered.map((i) => i.id));
    return filtered.filter((item) => itemShownAsRootInFiltered(item, ids));
  }, [filtered]);

  const handleToggleCollapse = (id: string) => {
    const note = notes.find((n) => n.id === id);
    if (note) updateNote(id, { collapsed: !note.collapsed });
  };

  const resetNoteForm = () => { setNTitle(''); setNDesc(''); setNDeadline(undefined); setNParentVal(''); };
  const resetTaskForm = () => { setTTitle(''); setTDesc(''); setTTarget(10); setTDeadline(undefined); setTParentVal(''); };

  const handleAddNote = () => {
    if (!nTitle.trim()) return;
    const parsed = nParentVal ? parseParentPickerValue(nParentVal) : null;
    addNote({
      title: nTitle.trim(),
      description: nDesc.trim(),
      deadline: nDeadline,
      daily: true,
      parentId: parsed?.id,
      parentType: parsed?.type,
    });
    resetNoteForm();
    setNoteModalOpen(false);
  };

  const handleAddTask = () => {
    if (!tTitle.trim() || tTarget < 1) return;
    const parsed = tParentVal ? parseParentPickerValue(tParentVal) : null;
    addTask({
      title: tTitle.trim(),
      description: tDesc.trim(),
      target: tTarget,
      deadline: tDeadline,
      daily: true,
      parentId: parsed?.id,
      parentType: parsed?.type,
    });
    resetTaskForm();
    setTaskModalOpen(false);
  };

  // ---- Schedule Template builder ----
  const addDraftRow = () => setDraftItems((prev) => [...prev, emptyDraft()]);
  const removeDraftRow = (key: string) => setDraftItems((prev) => prev.filter((d) => d.key !== key));
  const updateDraftRow = (key: string, patch: Partial<DraftItem>) =>
    setDraftItems((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const handleBuilderSubmit = () => {
    const validItems = draftItems.filter((d) => d.title.trim());
    if (validItems.length === 0) return;
    setScheduleMode('none');
    setWeekdayPick(emptyWeekdayPick());
    setMonthDays(new Set());
    setMoreDates([]);
    setMorePick('');
    setConfirmOpen(true);
  };

  const handleTemplateConfirm = async () => {
    const validItems = draftItems.filter((d) => d.title.trim());
    if (validItems.length === 0) return;
    if (!tplName.trim()) return;

    let scheduleKind: ScheduleKind = scheduleMode;
    const scheduleValue: string | null = null;
    const scheduleRules: ScheduleRules = {};

    if (scheduleMode === 'weekdays') {
      const wd = WEEKDAY_LABELS.map((w) => w.value).filter((w) => weekdayPick[w]);
      if (wd.length === 0) scheduleKind = 'none';
      else scheduleRules.weekdays = wd;
    } else if (scheduleMode === 'dates') {
      const arr = Array.from(monthDays).sort((a, b) => a - b);
      if (arr.length === 0) scheduleKind = 'none';
      else scheduleRules.monthDays = arr;
    } else if (scheduleMode === 'more') {
      if (moreDates.length === 0) scheduleKind = 'none';
      else scheduleRules.yearlyDates = [...moreDates].sort();
    }

    await addScheduleTemplate({
      name: tplName.trim(),
      description: tplDesc.trim(),
      scheduleKind,
      scheduleValue,
      scheduleRules,
      items: validItems.map((d) => ({
        type: d.type,
        title: d.title.trim(),
        description: d.description.trim(),
        deadlineTime: d.deadlineTime || null,
        target: d.type === 'task' ? d.target : null,
      })),
    });

    setConfirmOpen(false);
    setBuilderOpen(false);
    setDraftItems([emptyDraft()]);
    setTplName('');
    setTplDesc('');
    setScheduleMode('none');
    setWeekdayPick(emptyWeekdayPick());
    setMonthDays(new Set());
    setMoreDates([]);
    setMorePick('');
  };

  // ---- Preset logic ----
  const currentDailyAsPresetItems = (): PresetItem[] => {
    return allDailyItems.map((item) => {
      const base: PresetItem = { type: item.type, title: item.title, description: item.description, deadline: item.deadline };
      if (item.type === 'task') base.target = (item as Task).target;
      return base;
    });
  };

  const itemsMatchAnyPreset = (): boolean => {
    if (allDailyItems.length === 0) return true;
    const currentTitles = new Set(allDailyItems.map((i) => `${i.type}:${i.title}`));
    return presets.some((p) => {
      if (p.items.length !== currentTitles.size) return false;
      return p.items.every((pi) => currentTitles.has(`${pi.type}:${pi.title}`));
    });
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    addPreset(presetName.trim(), currentDailyAsPresetItems());
    setPresetName('');
    setSavePresetOpen(false);
  };

  const executeApplyPreset = async (presetId: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;

    setNotes((prev) => prev.filter((n) => !n.daily));
    setTasks((prev) => prev.filter((t) => !t.daily));

    for (const item of preset.items) {
      if (item.type === 'note') {
        addNote({ title: item.title, description: item.description, deadline: item.deadline, daily: true });
      } else {
        addTask({ title: item.title, description: item.description, target: item.target ?? 10, deadline: item.deadline, daily: true });
      }
    }
    setPendingApplyId(null);
  };

  const handleApplyPreset = (presetId: string) => {
    if (allDailyItems.length > 0 && !itemsMatchAnyPreset()) {
      setPendingApplyId(presetId);
      setWarnUnsaved(true);
    } else {
      executeApplyPreset(presetId);
    }
  };

  const handleWarnSave = () => { setSavePresetOpen(true); setWarnUnsaved(false); };
  const handleWarnSkip = () => { setWarnUnsaved(false); if (pendingApplyId) executeApplyPreset(pendingApplyId); };
  const handleWarnCancel = () => { setWarnUnsaved(false); setPendingApplyId(null); };

  const handleEditPresetSave = () => {
    if (editPresetId && editPresetName.trim()) {
      updatePreset(editPresetId, { name: editPresetName.trim() });
    }
    setEditPresetId(null);
    setEditPresetName('');
  };

  const handleDeleteItem = (item: Item) => {
    item.type === 'note' ? deleteNote(item.id) : deleteTask(item.id);
  };

  const handleCompleteItem = (item: Item) => {
    item.type === 'note' ? completeNote(item.id) : completeTask(item.id);
  };

  /* Canvas drag */
  const dragRef = useRef<{
    id: string; startX: number; startY: number;
    origX: number; origY: number; rafId: number | null;
  } | null>(null);
  const [dragOffsets, setDragOffsets] = useState<Record<string, { x: number; y: number }>>({});

  const canvasPos = (idx: number) => {
    const cols = 3;
    return { x: 40 + (idx % cols) * 310, y: 40 + Math.floor(idx / cols) * 260 };
  };

  const handleCanvasMouseDown = (id: string, idx: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    const base = canvasPos(idx);
    const offset = dragOffsets[id] ?? { x: 0, y: 0 };
    const pos = { x: base.x + offset.x, y: base.y + offset.y };
    dragRef.current = { id, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, rafId: null };

    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current || dragRef.current.rafId !== null) return;
      dragRef.current.rafId = requestAnimationFrame(() => {
        const drag = dragRef.current;
        if (!drag) return;
        const newX = drag.origX + ev.clientX - drag.startX;
        const newY = drag.origY + ev.clientY - drag.startY;
        const basePos = canvasPos(idx);
        setDragOffsets((prev) => ({
          ...prev,
          [drag.id]: { x: newX - basePos.x, y: newY - basePos.y },
        }));
        drag.rafId = null;
      });
    };

    const handleUp = () => {
      if (dragRef.current?.rafId != null) cancelAnimationFrame(dragRef.current.rafId);
      dragRef.current = null;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  const tableDeleteItem = tableDeleteId ? visibleFiltered.find((i) => i.id === tableDeleteId.id) : null;

  // Schedule template helpers
  const scheduleLabel = (tpl: ScheduleTemplate) => {
    const r = tpl.scheduleRules || {};
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    if (tpl.scheduleKind === 'none') return 'No schedule';
    if (tpl.scheduleKind === 'daily') return 'Daily';
    if (tpl.scheduleKind === 'weekdays' && r.weekdays?.length) {
      return `Weekdays: ${r.weekdays.map((w) => cap(w)).join(', ')}`;
    }
    if (tpl.scheduleKind === 'dates' && r.monthDays?.length) {
      return `Dates: ${r.monthDays.join(', ')}`;
    }
    if (tpl.scheduleKind === 'more' && r.yearlyDates?.length) {
      return `More: ${r.yearlyDates.join(', ')}`;
    }
    if (tpl.scheduleValue) {
      return tpl.scheduleKind === 'weekdays'
        ? `Weekdays: ${cap(tpl.scheduleValue)}`
        : `More: ${tpl.scheduleValue}`;
    }
    return 'Schedule';
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Schedule</h1>
        <div className="toolbar-actions" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => { setDraftItems([emptyDraft()]); setBuilderOpen(true); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Templates
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setNoteModalOpen(true)} data-tutorial-target="schedule-daily-note">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Daily Note
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setTaskModalOpen(true)} data-tutorial-target="schedule-daily-task">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Daily Task
          </button>
        </div>
      </header>

      {/* Daily items section */}
      <div className="page-toolbar">
        <SearchBar value={search} onChange={setSearch} placeholder="Search daily items..." />
        <SortControls field={sortField} dir={sortDir} onFieldChange={setSortField} onDirChange={setSortDir} showProgress showType />
        <div className="view-toggle">
          {(['list', 'table', 'canvas'] as ViewMode[]).map((v) => (
            <button key={v} className={`vt-btn ${viewMode === v ? 'active' : ''}`} onClick={() => setViewMode(v)}>
              {v === 'list' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>}
              {v === 'table' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>}
              {v === 'canvas' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="8" height="7" rx="1.5"/><rect x="14" y="3" width="8" height="5" rx="1.5"/><rect x="2" y="14" width="8" height="7" rx="1.5"/><rect x="14" y="12" width="8" height="9" rx="1.5"/></svg>}
            </button>
          ))}
        </div>
      </div>

      {viewMode === 'list' && (
        <div className="card-grid">
          {visibleFiltered.length === 0 && <p className="empty-state">No daily items yet. Create one, apply a preset, or set up a template!</p>}
          {visibleFiltered.map((item) => {
            if (item.type === 'note') {
              return (
                <NoteCard key={item.id} note={item as Note} allNotes={notes} allTasks={tasks} now={now}
                  onCompleteNote={completeNote} onCompleteTask={completeTask}
                  onDeleteNote={deleteNote} onDeleteTask={deleteTask}
                  onToggleCollapse={handleToggleCollapse}
                  onUpdateNote={updateNote} onUpdateTask={updateTask}
                  addNote={addNote} addTask={addTask}
                  allowParentEdit />
              );
            }
            return (
              <TaskCard key={item.id} task={item as Task} allNotes={notes} allTasks={tasks} now={now}
                onUpdate={updateTask} onUpdateNote={updateNote}
                onCompleteNote={completeNote} onCompleteTask={completeTask}
                onDeleteNote={deleteNote} onDeleteTask={deleteTask}
                onToggleCollapse={handleToggleCollapse}
                addNote={addNote} addTask={addTask}
                allowParentEdit />
            );
          })}
        </div>
      )}

      {viewMode === 'table' && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr><th>Type</th><th>Title</th><th>Progress</th><th>Deadline</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {visibleFiltered.length === 0 && (
                <tr><td colSpan={6} className="empty-state">No daily items yet.</td></tr>
              )}
              {visibleFiltered.map((item) => {
                const fromT = item.type === 'note'
                  ? Boolean((item as Note).sourceScheduleTemplateId)
                  : Boolean((item as Task).sourceScheduleTemplateId);
                const exp = !item.completed && isExpired(item.deadline, now);
                return (
                <tr key={item.id} className={[exp && 'row-expired', itemOriginRowClass(item.daily, fromT)].filter(Boolean).join(' ')}>
                  <td>
                    <span className={`type-tag type-${item.type}`}>{item.type}</span>
                    <div className="td-origin-wrap">
                      <ItemOriginBadges daily={item.daily} fromTemplate={fromT} />
                    </div>
                  </td>
                  <td className={`td-title ${item.type === 'note' && (item as Note).parentId ? 'td-title-subnote' : ''}`}>
                    <span className="td-title-text">{item.title}</span>
                  </td>
                  <td>{item.type === 'task' ? <ProgressBar progress={(item as Task).progress} target={(item as Task).target} compact /> : '—'}</td>
                  <td>{item.deadline ? <DeadlineBadge deadline={item.deadline} now={now} completed={item.completed} /> : <span className="text-muted">—</span>}</td>
                  <td>{item.completed ? <span className="text-ok">Done</span> : exp ? <span className="text-danger">Expired</span> : <span className="text-ok">Active</span>}</td>
                  <td className="td-actions">
                    {!item.completed && <button className="btn btn-sm btn-ghost btn-complete" onClick={() => handleCompleteItem(item)}>✓</button>}
                    <button className="btn btn-sm btn-ghost btn-delete" onClick={() => setTableDeleteId({ id: item.id, type: item.type })}>✕</button>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === 'canvas' && (
        <div className="canvas-view">
          {visibleFiltered.length === 0 && <p className="empty-state" style={{ position: 'absolute', width: '100%', top: '40%' }}>No daily items yet.</p>}
          {visibleFiltered.map((item, idx) => {
            const base = canvasPos(idx);
            const offset = dragOffsets[item.id] ?? { x: 0, y: 0 };
            if (item.type === 'note') {
              return (
                <div key={item.id} style={{ position: 'absolute', left: base.x + offset.x, top: base.y + offset.y, width: 280 }}
                  onMouseDown={handleCanvasMouseDown(item.id, idx)} className="canvas-card">
                  <NoteCard note={item as Note} allNotes={notes} allTasks={tasks} now={now}
                    onCompleteNote={completeNote} onCompleteTask={completeTask}
                    onDeleteNote={deleteNote} onDeleteTask={deleteTask}
                    onToggleCollapse={handleToggleCollapse}
                    onUpdateNote={updateNote} onUpdateTask={updateTask}
                    addNote={addNote} addTask={addTask}
                    allowParentEdit />
                </div>
              );
            }
            return (
              <div key={item.id} style={{ position: 'absolute', left: base.x + offset.x, top: base.y + offset.y, width: 280 }}
                onMouseDown={handleCanvasMouseDown(item.id, idx)} className="canvas-card">
                <TaskCard task={item as Task} allNotes={notes} allTasks={tasks} now={now}
                  onUpdate={updateTask} onUpdateNote={updateNote}
                  onCompleteNote={completeNote} onCompleteTask={completeTask}
                  onDeleteNote={deleteNote} onDeleteTask={deleteTask}
                  onToggleCollapse={handleToggleCollapse}
                  addNote={addNote} addTask={addTask}
                  allowParentEdit />
              </div>
            );
          })}
        </div>
      )}

      {/* Schedule Templates section */}
      <div className="schedule-presets" style={{ marginTop: 32 }}>
        <div className="presets-header">
          <h2 className="presets-title">Schedule Templates</h2>
          <button className="btn btn-sm btn-primary" onClick={() => { setDraftItems([emptyDraft()]); setBuilderOpen(true); }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Template
          </button>
        </div>
        <p className="text-muted" style={{ fontSize: '0.82rem', margin: '4px 0 12px' }}>
          Templates can be <strong>none</strong> (saved for later), <strong>daily</strong>, <strong>weekdays</strong>,{' '}
          <strong>dates</strong> (days 1–31 each month), or <strong>more</strong> (yearly dates). Several templates can
          apply the same day. Items with a <strong>time</strong> are removed after that app-day ends; no time means they
          stay until you clear them.
        </p>

        {scheduleTemplates.length === 0 && <p className="empty-state" style={{ padding: '12px 0' }}>No schedule templates yet.</p>}

        <div className="presets-list">
          {scheduleTemplates.map((tpl) => (
            <div key={tpl.id} className="preset-card">
              <div className="preset-card-header" onClick={() => setExpandedTpl(expandedTpl === tpl.id ? null : tpl.id)}>
                <div className="preset-card-info" style={{ gap: 8 }}>
                  <span className="preset-card-name">{tpl.name}</span>
                  <span className="badge badge-daily">{scheduleLabel(tpl)}</span>
                  <span className="preset-card-count">{tpl.items.length} items</span>
                </div>
                <div className="preset-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-sm btn-ghost btn-delete" onClick={() => setConfirmDeleteTpl(tpl.id)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </div>
              {tpl.description && expandedTpl === tpl.id && (
                <p className="text-muted" style={{ fontSize: '0.82rem', padding: '0 12px 4px', margin: 0 }}>{tpl.description}</p>
              )}
              {expandedTpl === tpl.id && (
                <div className="preset-card-body">
                  {tpl.items.map((it, i) => (
                    <div key={it.id || i} className="preset-item-row">
                      <span className={`type-tag type-${it.type}`}>{it.type}</span>
                      <span className="preset-item-title">{it.title}</span>
                      {it.type === 'task' && it.target && <span className="text-muted">target: {it.target}</span>}
                      {it.deadlineTime && <span className="text-muted">{it.deadlineTime}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Presets section */}
      <div className="schedule-presets">
        <div className="presets-header">
          <h2 className="presets-title">Presets</h2>
          <button className="btn btn-sm" onClick={() => { setPresetName(''); setSavePresetOpen(true); }}>
            Save Current as Preset
          </button>
        </div>

        {presets.length === 0 && <p className="empty-state" style={{ padding: '20px 0' }}>No presets saved yet.</p>}

        <div className="presets-list">
          {presets.map((preset) => (
            <div key={preset.id} className="preset-card">
              <div className="preset-card-header" onClick={() => setExpandedPreset(expandedPreset === preset.id ? null : preset.id)}>
                <div className="preset-card-info">
                  <span className="preset-card-name">{preset.name}</span>
                  <span className="preset-card-count">{preset.items.length} items</span>
                </div>
                <div className="preset-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-sm btn-primary" onClick={() => handleApplyPreset(preset.id)}>Apply</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => { setEditPresetId(preset.id); setEditPresetName(preset.name); }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button className="btn btn-sm btn-ghost btn-delete" onClick={() => setConfirmDeletePreset(preset.id)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </div>
              {expandedPreset === preset.id && (
                <div className="preset-card-body">
                  {preset.items.map((pi, i) => (
                    <div key={i} className="preset-item-row">
                      <span className={`type-tag type-${pi.type}`}>{pi.type}</span>
                      <span className="preset-item-title">{pi.title}</span>
                      {pi.type === 'task' && pi.target && <span className="text-muted">target: {pi.target}</span>}
                      {pi.deadline && <span className="text-muted">{pi.deadline}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ===== MODALS ===== */}

      {/* Daily Note */}
      <Modal open={noteModalOpen} onClose={() => { setNoteModalOpen(false); resetNoteForm(); }} title="New Daily Note">
        <div className="form-group">
          <label>Title</label>
          <input className="input" value={nTitle} onChange={(e) => setNTitle(e.target.value)} autoFocus placeholder="Daily note title..." />
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea className="input textarea" value={nDesc} onChange={(e) => setNDesc(e.target.value)} rows={3} placeholder="Optional details..." />
        </div>
        <DeadlinePicker value={nDeadline} onChange={setNDeadline} timeOnly />
        <div className="form-group">
          <label>Parent (daily items only)</label>
          <select className="input select" value={nParentVal} onChange={(e) => setNParentVal(e.target.value)}>
            <option value="">None (top-level)</option>
            {dailyParentOpts.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary btn-full" onClick={handleAddNote}>Create Daily Note</button>
      </Modal>

      {/* Daily Task */}
      <Modal open={taskModalOpen} onClose={() => { setTaskModalOpen(false); resetTaskForm(); }} title="New Daily Task">
        <div className="form-group">
          <label>Title</label>
          <input className="input" value={tTitle} onChange={(e) => setTTitle(e.target.value)} autoFocus placeholder="Daily task title..." />
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea className="input textarea" value={tDesc} onChange={(e) => setTDesc(e.target.value)} rows={3} placeholder="Optional details..." />
        </div>
        <div className="form-group">
          <label>Target amount</label>
          <input className="input" type="number" min={1} value={tTarget} onChange={(e) => setTTarget(Number(e.target.value))} />
        </div>
        <DeadlinePicker value={tDeadline} onChange={setTDeadline} timeOnly />
        <div className="form-group">
          <label>Parent (daily items only)</label>
          <select className="input select" value={tParentVal} onChange={(e) => setTParentVal(e.target.value)}>
            <option value="">None (top-level)</option>
            {dailyParentOpts.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary btn-full" onClick={handleAddTask}>Create Daily Task</button>
      </Modal>

      {/* Template Builder (big modal) */}
      <Modal open={builderOpen} onClose={() => setBuilderOpen(false)} title="Build Schedule Template">
        <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: 12 }}>
          Add notes and tasks that will be included in this template. You'll set the name and schedule on the next step.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '55vh', overflowY: 'auto', paddingRight: 4 }}>
          {draftItems.map((d, idx) => (
            <div key={d.key} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12, borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Item {idx + 1}</span>
                {draftItems.length > 1 && (
                  <button className="btn btn-sm btn-ghost btn-delete" onClick={() => removeDraftRow(d.key)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                )}
              </div>
              <div className="theme-modes" style={{ marginBottom: 2 }}>
                <button className={`theme-mode-btn ${d.type === 'note' ? 'active' : ''}`} onClick={() => updateDraftRow(d.key, { type: 'note' })}>Note</button>
                <button className={`theme-mode-btn ${d.type === 'task' ? 'active' : ''}`} onClick={() => updateDraftRow(d.key, { type: 'task' })}>Task</button>
              </div>
              <input className="input" placeholder="Title" value={d.title} onChange={(e) => updateDraftRow(d.key, { title: e.target.value })} />
              <input className="input" placeholder="Description (optional)" value={d.description} onChange={(e) => updateDraftRow(d.key, { description: e.target.value })} />
              {d.type === 'task' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>Target:</label>
                  <input className="input" type="number" min={1} value={d.target} onChange={(e) => updateDraftRow(d.key, { target: Number(e.target.value) })} style={{ width: 80 }} />
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>Deadline time:</label>
                <input className="input" type="time" value={d.deadlineTime} onChange={(e) => updateDraftRow(d.key, { deadlineTime: e.target.value })} style={{ width: 120 }} />
              </div>
            </div>
          ))}
        </div>
        <button className="btn btn-full" style={{ marginTop: 12 }} onClick={addDraftRow}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Item
        </button>
        <button className="btn btn-primary btn-full" style={{ marginTop: 8 }} onClick={handleBuilderSubmit}>
          Next: Set Schedule
        </button>
      </Modal>

      {/* Template Confirm (small modal) */}
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm Template">
        <div className="form-group">
          <label>Template Name</label>
          <input className="input" value={tplName} onChange={(e) => setTplName(e.target.value)} autoFocus placeholder="e.g. Weekend Routine" />
        </div>
        <div className="form-group">
          <label>Description (optional)</label>
          <textarea className="input textarea" value={tplDesc} onChange={(e) => setTplDesc(e.target.value)} rows={2} placeholder="What is this template for?" />
        </div>
        <div className="form-group">
          <label>When to apply</label>
          <div className="theme-modes" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
            {(
              [
                ['none', 'None'],
                ['daily', 'Daily'],
                ['weekdays', 'Weekdays'],
                ['dates', 'Dates'],
                ['more', 'More'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                className={`theme-mode-btn ${scheduleMode === v ? 'active' : ''}`}
                onClick={() => setScheduleMode(v)}
              >
                {label}
              </button>
            ))}
          </div>
          {scheduleMode === 'weekdays' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {WEEKDAY_LABELS.map((w) => (
                <button
                  key={w.value}
                  type="button"
                  className={`btn btn-sm ${weekdayPick[w.value] ? 'btn-primary' : ''}`}
                  onClick={() => setWeekdayPick((p) => ({ ...p, [w.value]: !p[w.value] }))}
                >
                  {w.label.slice(0, 3)}
                </button>
              ))}
            </div>
          )}
          {scheduleMode === 'dates' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 120, overflowY: 'auto' }}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`btn btn-sm ${monthDays.has(d) ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ minWidth: 36 }}
                  onClick={() =>
                    setMonthDays((prev) => {
                      const n = new Set(prev);
                      if (n.has(d)) n.delete(d);
                      else n.add(d);
                      return n;
                    })
                  }
                >
                  {d}
                </button>
              ))}
            </div>
          )}
          {scheduleMode === 'more' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input className="input" type="date" value={morePick} onChange={(e) => setMorePick(e.target.value)} />
                <button type="button" className="btn btn-sm btn-primary" disabled={!morePick} onClick={() => {
                  const mmdd = morePick.slice(5);
                  if (mmdd && !moreDates.includes(mmdd)) setMoreDates((prev) => [...prev, mmdd].sort());
                  setMorePick('');
                }}>
                  Add date
                </button>
              </div>
              {moreDates.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85rem' }}>
                  {moreDates.map((d) => (
                    <li key={d} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {d}
                      <button type="button" className="btn btn-sm btn-ghost btn-delete" onClick={() => setMoreDates((prev) => prev.filter((x) => x !== d))}>
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <p className="text-muted" style={{ fontSize: '0.8rem' }}>
          {draftItems.filter((d) => d.title.trim()).length} item(s) will be included.
          {scheduleMode === 'none' && ' None: template stays in the list only — nothing is applied automatically.'}
          {scheduleMode === 'daily' && ' Daily: items are added every calendar day.'}
          {scheduleMode === 'weekdays' && ' Weekdays: pick at least one day.'}
          {scheduleMode === 'dates' && ' Dates: e.g. 1 and 15 → every month on those days.'}
          {scheduleMode === 'more' && ' More: yearly dates (MM-DD), repeat every year.'}
        </p>
        <button className="btn btn-primary btn-full" onClick={handleTemplateConfirm} disabled={!tplName.trim()}>
          Create Template
        </button>
      </Modal>

      {/* Save Preset */}
      <Modal open={savePresetOpen} onClose={() => setSavePresetOpen(false)} title="Save Preset">
        <div className="form-group">
          <label>Preset Name</label>
          <input className="input" value={presetName} onChange={(e) => setPresetName(e.target.value)} autoFocus placeholder="e.g. Weekday Routine" />
        </div>
        <p className="text-muted" style={{ fontSize: '0.82rem' }}>
          This will save your current {allDailyItems.length} daily item(s) as a reusable preset.
        </p>
        <button className="btn btn-primary btn-full" onClick={() => {
          handleSavePreset();
          if (pendingApplyId) {
            setTimeout(() => executeApplyPreset(pendingApplyId), 50);
          }
        }}>Save Preset</button>
      </Modal>

      {/* Rename Preset */}
      <Modal open={editPresetId !== null} onClose={() => setEditPresetId(null)} title="Rename Preset">
        <div className="form-group">
          <label>Preset Name</label>
          <input className="input" value={editPresetName} onChange={(e) => setEditPresetName(e.target.value)} autoFocus />
        </div>
        <button className="btn btn-primary btn-full" onClick={handleEditPresetSave}>Save</button>
      </Modal>

      {/* Warn unsaved */}
      <Modal open={warnUnsaved} onClose={handleWarnCancel} title="Unsaved Daily Items">
        <p className="card-desc" style={{ marginBottom: 4 }}>
          Your current daily items are not saved in any preset. Applying a new preset will replace them.
        </p>
        <div className="card-actions" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={handleWarnCancel}>Cancel</button>
          <button className="btn btn-danger-ghost" onClick={handleWarnSkip}>Skip &amp; Apply</button>
          <button className="btn btn-primary" onClick={handleWarnSave}>Save First</button>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDeletePreset !== null}
        title="Delete Preset"
        message={`Delete preset "${presets.find((p) => p.id === confirmDeletePreset)?.name}"? This cannot be undone.`}
        onConfirm={() => { if (confirmDeletePreset) deletePreset(confirmDeletePreset); setConfirmDeletePreset(null); }}
        onCancel={() => setConfirmDeletePreset(null)}
      />

      <ConfirmDialog
        open={confirmDeleteTpl !== null}
        title="Delete Template"
        message={`Delete template "${scheduleTemplates.find((t) => t.id === confirmDeleteTpl)?.name}"? Already-materialized items from past runs will remain.`}
        onConfirm={() => { if (confirmDeleteTpl) deleteScheduleTemplate(confirmDeleteTpl); setConfirmDeleteTpl(null); }}
        onCancel={() => setConfirmDeleteTpl(null)}
      />

      <ConfirmDialog
        open={tableDeleteId !== null}
        title={`Delete ${tableDeleteId?.type === 'note' ? 'Note' : 'Task'}`}
        message={tableDeleteItem ? `Delete "${tableDeleteItem.title}"? This cannot be undone.` : ''}
        onConfirm={() => { if (tableDeleteId && tableDeleteItem) handleDeleteItem(tableDeleteItem); setTableDeleteId(null); }}
        onCancel={() => setTableDeleteId(null)}
      />
    </div>
  );
}
