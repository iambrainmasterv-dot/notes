import { useState, useMemo } from 'react';
import type { Note, Task, Item, ViewMode, SortField, SortDir } from '../types';
import { SearchBar } from '../components/SearchBar';
import { SortControls } from '../components/SortControls';
import { ProgressBar } from '../components/ProgressBar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DeadlineBadge } from '../components/DeadlineBadge';
import { ItemOriginBadges } from '../components/ItemOriginBadges';
import { useTick } from '../hooks/useTick';

interface Props {
  notes: Note[];
  tasks: Task[];
  recoverNote: (id: string) => void;
  recoverTask: (id: string) => void;
  deleteNote: (id: string) => void;
  deleteTask: (id: string) => void;
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
}

export function CompletedPage({
  notes, tasks, recoverNote, recoverTask, deleteNote, deleteTask, setNotes, setTasks,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<'selected' | 'all' | null>(null);
  const [confirmSingleId, setConfirmSingleId] = useState<string | null>(null);

  const completedNotes = useMemo(() => notes.filter((n) => n.completed), [notes]);
  const completedTasks = useMemo(() => tasks.filter((t) => t.completed), [tasks]);
  const allItems: Item[] = useMemo(
    () => [...completedNotes, ...completedTasks],
    [completedNotes, completedTasks],
  );

  const filtered = useMemo(() => {
    let result = allItems;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((i) => i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
    }
    return [...result].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      if (sortField === 'title') { aVal = a.title.toLowerCase(); bVal = b.title.toLowerCase(); }
      else if (sortField === 'type') { aVal = a.type; bVal = b.type; }
      else { aVal = a.createdAt; bVal = b.createdAt; }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [allItems, search, sortField, sortDir]);

  const nearestDeadline = useMemo(() => {
    const ds = filtered.filter((i) => i.deadline).map((i) => i.deadline!).sort();
    return ds[0];
  }, [filtered]);
  const now = useTick(nearestDeadline);

  const toggle = (id: string) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectAll = () => {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((i) => i.id)));
  };
  const recoverItem = (item: Item) => {
    item.type === 'note' ? recoverNote(item.id) : recoverTask(item.id);
  };
  const deleteItem = (item: Item) => {
    item.type === 'note' ? deleteNote(item.id) : deleteTask(item.id);
    setSelected((prev) => { const n = new Set(prev); n.delete(item.id); return n; });
  };
  const executeDelete = () => {
    if (confirmAction === 'selected') {
      setNotes((prev) => prev.filter((n) => !selected.has(n.id)));
      setTasks((prev) => prev.filter((t) => !selected.has(t.id)));
    } else {
      setNotes((prev) => prev.filter((n) => !n.completed));
      setTasks((prev) => prev.filter((t) => !t.completed));
    }
    setSelected(new Set());
    setConfirmAction(null);
  };

  const confirmSingleItem = filtered.find((i) => i.id === confirmSingleId);

  const renderRow = (item: Item) => (
    <div key={item.id} className={`completed-row ${selected.has(item.id) ? 'selected' : ''}`}>
      <label className="completed-check">
        <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
      </label>
      <div className="completed-info">
        <div className="completed-top">
          <span className={`type-tag type-${item.type}`}>{item.type}</span>
          <div className="completed-badges-row">
            <ItemOriginBadges
              daily={item.daily}
              fromTemplate={item.type === 'note'
                ? Boolean((item as Note).sourceScheduleTemplateId)
                : Boolean((item as Task).sourceScheduleTemplateId)}
            />
            {item.deadline && (
              <DeadlineBadge deadline={item.deadline} now={now} completed />
            )}
          </div>
          <span className="completed-title">{item.title}</span>
          {item.type === 'task' && (
            <ProgressBar progress={(item as Task).progress} target={(item as Task).target} compact />
          )}
        </div>
        {item.description && <p className="completed-desc">{item.description}</p>}
      </div>
      <div className="completed-actions">
        <button className="btn btn-sm btn-ghost btn-recover" onClick={() => recoverItem(item)} title="Recover">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        </button>
        <button className="btn btn-sm btn-ghost btn-delete" onClick={() => setConfirmSingleId(item.id)} title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>
  );

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Completed</h1>
        <div className="toolbar-actions">
          <button className="btn btn-ghost btn-sm" onClick={selectAll}>
            {selected.size === filtered.length && filtered.length > 0 ? 'Deselect All' : 'Select All'}
          </button>
          {selected.size > 0 && (
            <button className="btn btn-sm btn-danger-ghost" onClick={() => setConfirmAction('selected')}>
              Delete {selected.size}
            </button>
          )}
          {filtered.length > 0 && (
            <button className="btn btn-sm btn-danger-ghost" onClick={() => setConfirmAction('all')}>
              Delete All
            </button>
          )}
        </div>
      </header>

      <div className="page-toolbar">
        <SearchBar value={search} onChange={setSearch} placeholder="Search completed..." />
        <SortControls field={sortField} dir={sortDir} onFieldChange={setSortField} onDirChange={setSortDir} showType />
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
        <div className="completed-grid">
          {filtered.length === 0 && <p className="empty-state">No completed items yet.</p>}
          {filtered.map(renderRow)}
        </div>
      )}

      {viewMode === 'table' && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr><th></th><th>Type</th><th>Title</th><th>Description</th><th>Progress</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="empty-state">No completed items yet.</td></tr>
              )}
              {filtered.map((item) => (
                <tr key={item.id} className={selected.has(item.id) ? 'row-selected' : ''}>
                  <td><input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} style={{ accentColor: 'var(--primary)', cursor: 'pointer' }} /></td>
                  <td><span className={`type-tag type-${item.type}`}>{item.type}</span></td>
                  <td className="td-title">{item.title}</td>
                  <td className="td-desc">{item.description || '—'}</td>
                  <td>{item.type === 'task' ? <ProgressBar progress={(item as Task).progress} target={(item as Task).target} compact /> : '—'}</td>
                  <td className="td-actions">
                    <button className="btn btn-sm btn-ghost btn-recover" onClick={() => recoverItem(item)}>↩</button>
                    <button className="btn btn-sm btn-ghost btn-delete" onClick={() => setConfirmSingleId(item.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === 'canvas' && (
        <div className="canvas-view">
          {filtered.length === 0 && <p className="empty-state" style={{ position: 'absolute', width: '100%', top: '40%' }}>No completed items yet.</p>}
          {filtered.map((item, idx) => {
            const cols = 3;
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            const x = 40 + col * 310;
            const y = 40 + row * 140;
            return (
              <div key={item.id} className="canvas-card" style={{ position: 'absolute', left: x, top: y, width: 280 }}>
                <div className={`card ${selected.has(item.id) ? 'card-selected' : ''}`}>
                  <div className="card-header">
                    <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} style={{ accentColor: 'var(--primary)', cursor: 'pointer' }} />
                    <span className={`type-tag type-${item.type}`}>{item.type}</span>
                    <h3 className="card-title" style={{ flex: 1 }}>{item.title}</h3>
                  </div>
                  {item.description && <p className="card-desc">{item.description}</p>}
                  {item.type === 'task' && <ProgressBar progress={(item as Task).progress} target={(item as Task).target} compact />}
                  <div className="card-actions">
                    <button className="btn btn-sm btn-ghost btn-recover" onClick={() => recoverItem(item)}>↩ Recover</button>
                    <button className="btn btn-sm btn-ghost btn-delete" onClick={() => setConfirmSingleId(item.id)}>✕ Delete</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirmAction !== null}
        title="Confirm Deletion"
        message={
          confirmAction === 'all'
            ? `Permanently delete all ${filtered.length} completed items? This cannot be undone.`
            : `Permanently delete ${selected.size} selected items? This cannot be undone.`
        }
        onConfirm={executeDelete}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmSingleId !== null}
        title="Delete Item"
        message={confirmSingleItem ? `Permanently delete "${confirmSingleItem.title}"? This cannot be undone.` : ''}
        onConfirm={() => { if (confirmSingleId) { const item = filtered.find((i) => i.id === confirmSingleId); if (item) deleteItem(item); } setConfirmSingleId(null); }}
        onCancel={() => setConfirmSingleId(null)}
      />
    </div>
  );
}
