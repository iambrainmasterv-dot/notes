import { useState, useMemo, useRef } from 'react';
import type { Task, ViewMode, SortField, SortDir } from '../types';
import { TaskCard } from '../components/TaskCard';
import { Modal } from '../components/Modal';
import { DeadlinePicker } from '../components/DeadlinePicker';
import { SearchBar } from '../components/SearchBar';
import { SortControls } from '../components/SortControls';
import { DeadlineBadge } from '../components/DeadlineBadge';
import { ItemOriginBadges } from '../components/ItemOriginBadges';
import { ProgressBar } from '../components/ProgressBar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { isExpired } from '../utils';
import { useTick } from '../hooks/useTick';

interface Props {
  tasks: Task[];
  addTask: (data: Omit<Task, 'id' | 'type' | 'completed' | 'createdAt' | 'progress'>) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  completeTask: (id: string) => void;
}

export function TasksPage({ tasks, addTask, updateTask, deleteTask, completeTask }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [modalOpen, setModalOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [target, setTarget] = useState(10);
  const [deadline, setDeadline] = useState<string | undefined>();

  const [tableDeleteId, setTableDeleteId] = useState<string | null>(null);

  const activeTasks = useMemo(() => tasks.filter((t) => !t.completed), [tasks]);

  const nearestDeadline = useMemo(() => {
    const upcoming = activeTasks.filter((t) => t.deadline).map((t) => t.deadline!).sort();
    return upcoming[0];
  }, [activeTasks]);
  const now = useTick(nearestDeadline);

  const filtered = useMemo(() => {
    let result = activeTasks;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
      );
    }
    return [...result].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      if (sortField === 'title') { aVal = a.title.toLowerCase(); bVal = b.title.toLowerCase(); }
      else if (sortField === 'deadline') { aVal = a.deadline ?? ''; bVal = b.deadline ?? ''; }
      else if (sortField === 'progress') {
        aVal = a.target > 0 ? a.progress / a.target : 0;
        bVal = b.target > 0 ? b.progress / b.target : 0;
      }
      else { aVal = a.createdAt; bVal = b.createdAt; }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [activeTasks, search, sortField, sortDir]);

  const resetForm = () => {
    setTitle(''); setDescription(''); setTarget(10); setDeadline(undefined);
  };

  const handleSubmit = () => {
    if (!title.trim() || target < 1) return;
    addTask({ title: title.trim(), description: description.trim(), target, deadline });
    resetForm();
    setModalOpen(false);
  };

  /* Canvas positions — tasks don't have a position field, so derive from index */
  const canvasPos = (idx: number) => {
    const cols = 3;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    return { x: 40 + col * 310, y: 40 + row * 260 };
  };

  const dragRef = useRef<{
    id: string; startX: number; startY: number;
    origX: number; origY: number; rafId: number | null;
  } | null>(null);
  const [dragOffsets, setDragOffsets] = useState<Record<string, { x: number; y: number }>>({});

  const handleCanvasMouseDown = (task: Task, idx: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    const base = canvasPos(idx);
    const offset = dragOffsets[task.id] ?? { x: 0, y: 0 };
    const pos = { x: base.x + offset.x, y: base.y + offset.y };
    dragRef.current = { id: task.id, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, rafId: null };

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

  const tableDeleteTask = filtered.find((t) => t.id === tableDeleteId);

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Tasks</h1>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Task
        </button>
      </header>

      <div className="page-toolbar">
        <SearchBar value={search} onChange={setSearch} placeholder="Search tasks..." />
        <SortControls field={sortField} dir={sortDir} onFieldChange={setSortField} onDirChange={setSortDir} showProgress />
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
          {filtered.length === 0 && <p className="empty-state">No tasks yet. Create one!</p>}
          {filtered.map((task) => (
            <TaskCard key={task.id} task={task} now={now}
              onUpdate={updateTask} onComplete={completeTask} onDelete={deleteTask} />
          ))}
        </div>
      )}

      {viewMode === 'table' && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr><th>Title</th><th>Progress</th><th>Deadline</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map((task) => {
                const exp = !task.completed && isExpired(task.deadline, now);
                return (
                <tr key={task.id} className={exp ? 'row-expired' : ''}>
                  <td className="td-title">
                    {task.title}
                    <div className="td-origin-wrap">
                      <ItemOriginBadges daily={task.daily} fromTemplate={Boolean(task.sourceScheduleTemplateId)} />
                    </div>
                  </td>
                  <td><ProgressBar progress={task.progress} target={task.target} compact /></td>
                  <td>{task.deadline ? <DeadlineBadge deadline={task.deadline} now={now} completed={task.completed} /> : <span className="text-muted">—</span>}</td>
                  <td>{task.completed ? <span className="text-ok">Completed</span> : exp ? <span className="text-danger">Expired</span> : <span className="text-ok">Active</span>}</td>
                  <td className="td-actions">
                    <button className="btn btn-sm btn-ghost btn-complete" onClick={() => completeTask(task.id)}>✓</button>
                    <button className="btn btn-sm btn-ghost btn-delete" onClick={() => setTableDeleteId(task.id)}>✕</button>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === 'canvas' && (
        <div className="canvas-view">
          {filtered.map((task, idx) => {
            const base = canvasPos(idx);
            const offset = dragOffsets[task.id] ?? { x: 0, y: 0 };
            return (
              <div key={task.id} className="canvas-card"
                onMouseDown={handleCanvasMouseDown(task, idx)}
                style={{ position: 'absolute', left: base.x + offset.x, top: base.y + offset.y, cursor: 'grab', width: 280 }}>
                <TaskCard task={task} now={now}
                  onUpdate={updateTask} onComplete={completeTask} onDelete={deleteTask} />
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={tableDeleteId !== null}
        title="Delete Task"
        message={tableDeleteTask ? `Delete "${tableDeleteTask.title}"? This cannot be undone.` : ''}
        onConfirm={() => { if (tableDeleteId) deleteTask(tableDeleteId); setTableDeleteId(null); }}
        onCancel={() => setTableDeleteId(null)}
      />

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); resetForm(); }} title="New Task">
        <div className="form-group">
          <label>Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="What needs doing?" />
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea className="input textarea" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Optional details..." />
        </div>
        <div className="form-group">
          <label>Target amount</label>
          <input className="input" type="number" min={1} value={target} onChange={(e) => setTarget(Number(e.target.value))} />
        </div>
        <DeadlinePicker value={deadline} onChange={setDeadline} />
        <button className="btn btn-primary btn-full" onClick={handleSubmit}>Create Task</button>
      </Modal>
    </div>
  );
}
