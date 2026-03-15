import { useState, useMemo, useRef, useCallback } from 'react';
import type { Note, ViewMode, SortField, SortDir } from '../types';
import { NoteCard } from '../components/NoteCard';
import { Modal } from '../components/Modal';
import { DeadlinePicker } from '../components/DeadlinePicker';
import { SearchBar } from '../components/SearchBar';
import { SortControls } from '../components/SortControls';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { isExpired } from '../utils';
import { useTick } from '../hooks/useTick';
import { DeadlineBadge } from '../components/DeadlineBadge';

interface Props {
  notes: Note[];
  addNote: (data: Omit<Note, 'id' | 'type' | 'completed' | 'createdAt'>) => void;
  updateNote: (id: string, patch: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  completeNote: (id: string) => void;
}

export function NotesPage({ notes, addNote, updateNote, deleteNote, completeNote }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [modalOpen, setModalOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState<string | undefined>();
  const [parentId, setParentId] = useState<string | undefined>();

  const [tableDeleteId, setTableDeleteId] = useState<string | null>(null);

  const activeNotes = useMemo(() => notes.filter((n) => !n.completed), [notes]);

  const nearestDeadline = useMemo(() => {
    const upcoming = activeNotes.filter((n) => n.deadline).map((n) => n.deadline!).sort();
    return upcoming[0];
  }, [activeNotes]);
  const now = useTick(nearestDeadline);

  const filtered = useMemo(() => {
    let result = activeNotes;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (n) => n.title.toLowerCase().includes(q) || n.description.toLowerCase().includes(q),
      );
    }
    return [...result].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      if (sortField === 'title') { aVal = a.title.toLowerCase(); bVal = b.title.toLowerCase(); }
      else if (sortField === 'deadline') { aVal = a.deadline ?? ''; bVal = b.deadline ?? ''; }
      else { aVal = a.createdAt; bVal = b.createdAt; }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [activeNotes, search, sortField, sortDir]);

  const topLevel = useMemo(() => filtered.filter((n) => !n.parentId), [filtered]);

  const handleToggleCollapse = useCallback(
    (id: string) => {
      const note = notes.find((n) => n.id === id);
      if (note) updateNote(id, { collapsed: !note.collapsed });
    },
    [notes, updateNote],
  );

  const resetForm = () => {
    setTitle(''); setDescription(''); setDeadline(undefined); setParentId(undefined);
  };

  const handleSubmit = () => {
    if (!title.trim()) return;
    addNote({ title: title.trim(), description: description.trim(), deadline, parentId });
    resetForm();
    setModalOpen(false);
  };

  const dragRef = useRef<{
    id: string; startX: number; startY: number;
    origX: number; origY: number; rafId: number | null;
  } | null>(null);

  const handleCanvasMouseDown = (note: Note) => (e: React.MouseEvent) => {
    e.preventDefault();
    const pos = note.position ?? { x: 0, y: 0 };
    dragRef.current = { id: note.id, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, rafId: null };

    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current || dragRef.current.rafId !== null) return;
      dragRef.current.rafId = requestAnimationFrame(() => {
        const drag = dragRef.current;
        if (!drag) return;
        updateNote(drag.id, {
          position: {
            x: drag.origX + ev.clientX - drag.startX,
            y: drag.origY + ev.clientY - drag.startY,
          },
        });
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

  const tableDeleteNote = filtered.find((n) => n.id === tableDeleteId);

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Notes</h1>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Note
        </button>
      </header>

      <div className="page-toolbar">
        <SearchBar value={search} onChange={setSearch} placeholder="Search notes..." />
        <SortControls field={sortField} dir={sortDir} onFieldChange={setSortField} onDirChange={setSortDir} />
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
          {topLevel.length === 0 && <p className="empty-state">No notes yet. Create one!</p>}
          {topLevel.map((note) => (
            <NoteCard key={note.id} note={note} allNotes={activeNotes} now={now}
              onComplete={completeNote} onDelete={deleteNote} onToggleCollapse={handleToggleCollapse} />
          ))}
        </div>
      )}

      {viewMode === 'table' && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr><th>Title</th><th>Description</th><th>Deadline</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map((note) => (
                <tr key={note.id} className={isExpired(note.deadline, now) ? 'row-expired' : ''}>
                  <td className="td-title">{note.parentId ? '↳ ' : ''}{note.title}</td>
                  <td className="td-desc">{note.description || '—'}</td>
                  <td>{note.deadline ? <DeadlineBadge deadline={note.deadline} now={now} /> : <span className="text-muted">—</span>}</td>
                  <td>{isExpired(note.deadline, now) ? <span className="text-danger">Expired</span> : <span className="text-ok">Active</span>}</td>
                  <td className="td-actions">
                    <button className="btn btn-sm btn-ghost btn-complete" onClick={() => completeNote(note.id)}>✓</button>
                    <button className="btn btn-sm btn-ghost btn-delete" onClick={() => setTableDeleteId(note.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === 'canvas' && (
        <div className="canvas-view">
          {topLevel.map((note) => {
            const pos = note.position ?? { x: 0, y: 0 };
            return (
              <NoteCard key={note.id} note={note} allNotes={activeNotes} now={now}
                onComplete={completeNote} onDelete={deleteNote} onToggleCollapse={handleToggleCollapse}
                onMouseDown={handleCanvasMouseDown(note)} className="canvas-card"
                style={{ position: 'absolute', left: pos.x, top: pos.y, cursor: 'grab' }} />
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={tableDeleteId !== null}
        title="Delete Note"
        message={tableDeleteNote ? `Delete "${tableDeleteNote.title}"? This cannot be undone.` : ''}
        onConfirm={() => { if (tableDeleteId) deleteNote(tableDeleteId); setTableDeleteId(null); }}
        onCancel={() => setTableDeleteId(null)}
      />

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); resetForm(); }} title="New Note">
        <div className="form-group">
          <label>Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="What's on your mind?" />
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea className="input textarea" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Optional details..." />
        </div>
        <DeadlinePicker value={deadline} onChange={setDeadline} />
        <div className="form-group">
          <label>Parent Note</label>
          <select className="input select" value={parentId ?? ''} onChange={(e) => setParentId(e.target.value || undefined)}>
            <option value="">None (top-level)</option>
            {activeNotes.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
          </select>
        </div>
        <button className="btn btn-primary btn-full" onClick={handleSubmit}>Create Note</button>
      </Modal>
    </div>
  );
}
