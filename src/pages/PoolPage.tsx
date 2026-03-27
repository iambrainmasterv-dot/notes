import { useState, useMemo, useRef } from 'react';
import type { Note, Task, Item, ViewMode, SortField, SortDir } from '../types';
import { NoteCard } from '../components/NoteCard';
import { ItemOriginBadges } from '../components/ItemOriginBadges';
import { TaskCard } from '../components/TaskCard';
import { SearchBar } from '../components/SearchBar';
import { SortControls } from '../components/SortControls';
import { DeadlineBadge } from '../components/DeadlineBadge';
import { ProgressBar } from '../components/ProgressBar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { isExpired, itemOriginRowClass, itemShownAsRootInFiltered } from '../utils';
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
  onPoolQuickCreateNote?: () => void;
  onPoolQuickCreateTask?: () => void;
}

export function PoolPage({
  notes, tasks, addNote, addTask, updateNote, updateTask,
  deleteNote, deleteTask, completeNote, completeTask,
  onPoolQuickCreateNote, onPoolQuickCreateTask,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [tableDeleteId, setTableDeleteId] = useState<{ id: string; type: 'note' | 'task' } | null>(null);

  const activeNotes = useMemo(() => notes.filter((n) => !n.completed), [notes]);
  const activeTasks = useMemo(() => tasks.filter((t) => !t.completed), [tasks]);
  const allItems: Item[] = useMemo(
    () => [...activeNotes, ...activeTasks],
    [activeNotes, activeTasks],
  );

  const nearestDeadline = useMemo(() => {
    const upcoming = allItems.filter((i) => i.deadline).map((i) => i.deadline!).sort();
    return upcoming[0];
  }, [allItems]);
  const now = useTick(nearestDeadline);

  const filtered = useMemo(() => {
    let result = allItems;
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
  }, [allItems, search, sortField, sortDir]);

  const visibleFiltered = useMemo(() => {
    const ids = new Set(filtered.map((i) => i.id));
    return filtered.filter((item) => itemShownAsRootInFiltered(item, ids));
  }, [filtered]);

  const handleToggleCollapse = (id: string) => {
    const note = notes.find((n) => n.id === id);
    if (note) updateNote(id, { collapsed: !note.collapsed });
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
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    return { x: 40 + col * 310, y: 40 + row * 260 };
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

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Pool</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="text-muted" style={{ fontSize: '0.85rem' }}>{visibleFiltered.length} active items</span>
          {onPoolQuickCreateNote && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={onPoolQuickCreateNote}
              data-tutorial-target="pool-add-note"
            >
              Add Note
            </button>
          )}
          {onPoolQuickCreateTask && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={onPoolQuickCreateTask}
              data-tutorial-target="pool-add-task"
            >
              Add Task
            </button>
          )}
        </div>
      </header>

      <div className="page-toolbar">
        <SearchBar value={search} onChange={setSearch} placeholder="Search all items..." />
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
          {visibleFiltered.length === 0 && <p className="empty-state">No active items. Everything is completed!</p>}
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
              <tr><th>Type</th><th>Title</th><th>Description</th><th>Progress</th><th>Deadline</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {visibleFiltered.length === 0 && (
                <tr><td colSpan={7} className="empty-state">No active items.</td></tr>
              )}
              {visibleFiltered.map((item) => {
                const done = item.completed;
                const exp = !done && isExpired(item.deadline, now);
                const fromT = item.type === 'note'
                  ? Boolean((item as Note).sourceScheduleTemplateId)
                  : Boolean((item as Task).sourceScheduleTemplateId);
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
                  <td className="td-desc">{item.description || '—'}</td>
                  <td>{item.type === 'task' ? <ProgressBar progress={(item as Task).progress} target={(item as Task).target} compact /> : '—'}</td>
                  <td>{item.deadline ? <DeadlineBadge deadline={item.deadline} now={now} completed={done} /> : <span className="text-muted">—</span>}</td>
                  <td>{done ? <span className="text-ok">Completed</span> : exp ? <span className="text-danger">Expired</span> : <span className="text-ok">Active</span>}</td>
                  <td className="td-actions">
                    <button className="btn btn-sm btn-ghost btn-complete" onClick={() => handleCompleteItem(item)}>✓</button>
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
          {visibleFiltered.length === 0 && <p className="empty-state" style={{ position: 'absolute', width: '100%', top: '40%' }}>No active items.</p>}
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
