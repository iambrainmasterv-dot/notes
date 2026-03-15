import { useState, useMemo, useRef } from 'react';
import type { Note, Task, Item, ViewMode, SortField, SortDir, Preset, PresetItem } from '../types';
import { NoteCard } from '../components/NoteCard';
import { TaskCard } from '../components/TaskCard';
import { Modal } from '../components/Modal';
import { DeadlinePicker } from '../components/DeadlinePicker';
import { SearchBar } from '../components/SearchBar';
import { SortControls } from '../components/SortControls';
import { DeadlineBadge } from '../components/DeadlineBadge';
import { ProgressBar } from '../components/ProgressBar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { isExpired } from '../utils';
import { useTick } from '../hooks/useTick';

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
}

export function SchedulePage({
  notes, tasks, addNote, addTask, updateNote, updateTask,
  deleteNote, deleteTask, completeNote, completeTask,
  setNotes, setTasks,
  presets, addPreset, updatePreset, deletePreset,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Create modals
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [nTitle, setNTitle] = useState('');
  const [nDesc, setNDesc] = useState('');
  const [nDeadline, setNDeadline] = useState<string | undefined>();
  const [tTitle, setTTitle] = useState('');
  const [tDesc, setTDesc] = useState('');
  const [tTarget, setTTarget] = useState(10);
  const [tDeadline, setTDeadline] = useState<string | undefined>();

  // Preset modals
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [confirmDeletePreset, setConfirmDeletePreset] = useState<string | null>(null);
  const [warnUnsaved, setWarnUnsaved] = useState(false);
  const [pendingApplyId, setPendingApplyId] = useState<string | null>(null);
  const [expandedPreset, setExpandedPreset] = useState<string | null>(null);

  // Edit preset
  const [editPresetId, setEditPresetId] = useState<string | null>(null);
  const [editPresetName, setEditPresetName] = useState('');

  // Table delete
  const [tableDeleteId, setTableDeleteId] = useState<{ id: string; type: 'note' | 'task' } | null>(null);

  const dailyNotes = useMemo(() => notes.filter((n) => n.daily), [notes]);
  const dailyTasks = useMemo(() => tasks.filter((t) => t.daily), [tasks]);
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

  const handleToggleCollapse = (id: string) => {
    const note = notes.find((n) => n.id === id);
    if (note) updateNote(id, { collapsed: !note.collapsed });
  };

  const resetNoteForm = () => { setNTitle(''); setNDesc(''); setNDeadline(undefined); };
  const resetTaskForm = () => { setTTitle(''); setTDesc(''); setTTarget(10); setTDeadline(undefined); };

  const handleAddNote = () => {
    if (!nTitle.trim()) return;
    addNote({ title: nTitle.trim(), description: nDesc.trim(), deadline: nDeadline, daily: true });
    resetNoteForm();
    setNoteModalOpen(false);
  };

  const handleAddTask = () => {
    if (!tTitle.trim() || tTarget < 1) return;
    addTask({ title: tTitle.trim(), description: tDesc.trim(), target: tTarget, deadline: tDeadline, daily: true });
    resetTaskForm();
    setTaskModalOpen(false);
  };

  // Preset logic
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

  const executeApplyPreset = (presetId: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;

    // Remove all current daily items
    setNotes((prev) => prev.filter((n) => !n.daily));
    setTasks((prev) => prev.filter((t) => !t.daily));

    // Create new daily items from preset
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

  const handleWarnSave = () => {
    setSavePresetOpen(true);
    setWarnUnsaved(false);
  };

  const handleWarnSkip = () => {
    setWarnUnsaved(false);
    if (pendingApplyId) executeApplyPreset(pendingApplyId);
  };

  const handleWarnCancel = () => {
    setWarnUnsaved(false);
    setPendingApplyId(null);
  };

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

  const tableDeleteItem = tableDeleteId ? filtered.find((i) => i.id === tableDeleteId.id) : null;
  const activeNotes = useMemo(() => notes.filter((n) => !n.completed && n.daily), [notes]);

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Schedule</h1>
        <div className="toolbar-actions">
          <button className="btn btn-primary" onClick={() => setNoteModalOpen(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Daily Note
          </button>
          <button className="btn btn-primary" onClick={() => setTaskModalOpen(true)}>
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
          {filtered.length === 0 && <p className="empty-state">No daily items yet. Create one or apply a preset!</p>}
          {filtered.map((item) => {
            if (item.type === 'note') {
              return (
                <NoteCard key={item.id} note={item as Note} allNotes={activeNotes} now={now}
                  onComplete={completeNote} onDelete={deleteNote} onToggleCollapse={handleToggleCollapse} />
              );
            }
            return (
              <TaskCard key={item.id} task={item as Task} now={now}
                onUpdate={updateTask} onComplete={completeTask} onDelete={deleteTask} />
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
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="empty-state">No daily items yet.</td></tr>
              )}
              {filtered.map((item) => (
                <tr key={item.id} className={isExpired(item.deadline, now) ? 'row-expired' : ''}>
                  <td><span className={`type-tag type-${item.type}`}>{item.type}</span></td>
                  <td className="td-title">{item.title}</td>
                  <td>{item.type === 'task' ? <ProgressBar progress={(item as Task).progress} target={(item as Task).target} compact /> : '—'}</td>
                  <td>{item.deadline ? <DeadlineBadge deadline={item.deadline} now={now} /> : <span className="text-muted">—</span>}</td>
                  <td>{item.completed ? <span className="text-ok">Done</span> : isExpired(item.deadline, now) ? <span className="text-danger">Expired</span> : <span className="text-ok">Active</span>}</td>
                  <td className="td-actions">
                    {!item.completed && <button className="btn btn-sm btn-ghost btn-complete" onClick={() => handleCompleteItem(item)}>✓</button>}
                    <button className="btn btn-sm btn-ghost btn-delete" onClick={() => setTableDeleteId({ id: item.id, type: item.type })}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === 'canvas' && (
        <div className="canvas-view">
          {filtered.length === 0 && <p className="empty-state" style={{ position: 'absolute', width: '100%', top: '40%' }}>No daily items yet.</p>}
          {filtered.map((item, idx) => {
            const base = canvasPos(idx);
            const offset = dragOffsets[item.id] ?? { x: 0, y: 0 };
            if (item.type === 'note') {
              return (
                <div key={item.id} style={{ position: 'absolute', left: base.x + offset.x, top: base.y + offset.y, width: 280 }}
                  onMouseDown={handleCanvasMouseDown(item.id, idx)} className="canvas-card">
                  <NoteCard note={item as Note} allNotes={activeNotes} now={now}
                    onComplete={completeNote} onDelete={deleteNote} onToggleCollapse={handleToggleCollapse} />
                </div>
              );
            }
            return (
              <div key={item.id} style={{ position: 'absolute', left: base.x + offset.x, top: base.y + offset.y, width: 280 }}
                onMouseDown={handleCanvasMouseDown(item.id, idx)} className="canvas-card">
                <TaskCard task={item as Task} now={now}
                  onUpdate={updateTask} onComplete={completeTask} onDelete={deleteTask} />
              </div>
            );
          })}
        </div>
      )}

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

      {/* Modals */}
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
        <button className="btn btn-primary btn-full" onClick={handleAddNote}>Create Daily Note</button>
      </Modal>

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
        <button className="btn btn-primary btn-full" onClick={handleAddTask}>Create Daily Task</button>
      </Modal>

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

      <Modal open={editPresetId !== null} onClose={() => setEditPresetId(null)} title="Rename Preset">
        <div className="form-group">
          <label>Preset Name</label>
          <input className="input" value={editPresetName} onChange={(e) => setEditPresetName(e.target.value)} autoFocus />
        </div>
        <button className="btn btn-primary btn-full" onClick={handleEditPresetSave}>Save</button>
      </Modal>

      {/* Warn unsaved dialog */}
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
        open={tableDeleteId !== null}
        title={`Delete ${tableDeleteId?.type === 'note' ? 'Note' : 'Task'}`}
        message={tableDeleteItem ? `Delete "${tableDeleteItem.title}"? This cannot be undone.` : ''}
        onConfirm={() => { if (tableDeleteId && tableDeleteItem) handleDeleteItem(tableDeleteItem); setTableDeleteId(null); }}
        onCancel={() => setTableDeleteId(null)}
      />
    </div>
  );
}
