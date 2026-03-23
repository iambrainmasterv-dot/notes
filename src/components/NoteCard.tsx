import { useState, useMemo, useEffect } from 'react';
import type { Note } from '../types';
import { isExpired, collectDescendantNoteIds, itemOriginCardClass } from '../utils';
import { DeadlineBadge } from './DeadlineBadge';
import { ConfirmDialog } from './ConfirmDialog';
import { Modal } from './Modal';
import { DeadlinePicker } from './DeadlinePicker';
import { ItemOriginBadges } from './ItemOriginBadges';

interface Props {
  note: Note;
  allNotes: Note[];
  now: number;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  /** Persist edits (title, description, deadline, optional parent) */
  onUpdateNote: (id: string, patch: Partial<Note>) => void;
  /** If true, edit modal includes parent note selector */
  allowParentEdit?: boolean;
  /** Nesting depth for visual hierarchy (subnotes under a root). */
  nestDepth?: number;
  onMouseDown?: React.MouseEventHandler<HTMLDivElement>;
  style?: React.CSSProperties;
  className?: string;
}

export function NoteCard({
  note,
  allNotes,
  now,
  onComplete,
  onDelete,
  onToggleCollapse,
  onUpdateNote,
  allowParentEdit = false,
  nestDepth = 0,
  onMouseDown,
  style,
  className = '',
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [eTitle, setETitle] = useState('');
  const [eDesc, setEDesc] = useState('');
  const [eDeadline, setEDeadline] = useState<string | undefined>();
  const [eParentId, setEParentId] = useState<string | undefined>();

  const fromTemplate = Boolean(note.sourceScheduleTemplateId);

  const expired = !note.completed && isExpired(note.deadline, now);
  const childNotes = useMemo(
    () => allNotes.filter((n) => n.parentId === note.id),
    [allNotes, note.id],
  );

  const blockedParentIds = useMemo(() => collectDescendantNoteIds(note.id, allNotes), [note.id, allNotes]);
  const parentOptions = useMemo(
    () => allNotes.filter((n) => !blockedParentIds.has(n.id)),
    [allNotes, blockedParentIds],
  );

  useEffect(() => {
    if (!editOpen) return;
    setETitle(note.title);
    setEDesc(note.description);
    setEDeadline(note.deadline);
    setEParentId(note.parentId);
  }, [editOpen, note.id, note.title, note.description, note.deadline, note.parentId]);

  const handleSaveEdit = () => {
    if (!eTitle.trim()) return;
    const patch: Partial<Note> = {
      title: eTitle.trim(),
      description: eDesc.trim(),
      deadline: eDeadline,
    };
    if (allowParentEdit) patch.parentId = eParentId;
    onUpdateNote(note.id, patch);
    setEditOpen(false);
  };

  const originClass = itemOriginCardClass(note.daily, fromTemplate);
  const depthClass = nestDepth > 0 ? `note-card-nested note-depth-${Math.min(nestDepth, 4)}` : '';
  const parentTitle = note.parentId
    ? (allNotes.find((n) => n.id === note.parentId)?.title ?? 'Parent (missing)')
    : undefined;

  return (
    <div
      className={`card ${originClass} ${depthClass} ${expired ? 'card-expired' : ''} ${note.completed ? 'card-completed' : ''} ${className}`}
      style={style}
      onMouseDown={onMouseDown}
    >
      <div className="card-header">
        <h3 className="card-title">{note.title}</h3>
        <div className="card-header-badges">
          <ItemOriginBadges daily={note.daily} fromTemplate={fromTemplate} />
          {note.deadline && (
            <DeadlineBadge deadline={note.deadline} now={now} completed={note.completed} />
          )}
        </div>
      </div>

      {note.description && <p className="card-desc">{note.description}</p>}

      {note.parentId && (
        <div className="badge-parent-wrap">
          <span className="badge badge-parent badge-parent-ellipsis" title={parentTitle}>
            ↳ {parentTitle}
          </span>
        </div>
      )}

      <div className="card-actions">
        <button type="button" className="btn btn-ghost" onClick={() => setEditOpen(true)} title="Edit note">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit
        </button>
        {!note.completed && (
          <button className="btn btn-ghost btn-complete" onClick={() => onComplete(note.id)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Complete
          </button>
        )}
        <button className="btn btn-ghost btn-delete" onClick={() => setConfirmDelete(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Delete
        </button>
      </div>

      {childNotes.length > 0 && (
        <div className="subnotes">
          <button className="btn-text" onClick={() => onToggleCollapse(note.id)}>
            {note.collapsed ? `▸ ${childNotes.length} subnotes` : `▾ ${childNotes.length} subnotes`}
          </button>
          {!note.collapsed && (
            <div className="subnotes-list subnotes-list--tree">
              {childNotes.map((child) => (
                <NoteCard
                  key={child.id}
                  note={child}
                  allNotes={allNotes}
                  now={now}
                  onComplete={onComplete}
                  onDelete={onDelete}
                  onToggleCollapse={onToggleCollapse}
                  onUpdateNote={onUpdateNote}
                  allowParentEdit={allowParentEdit}
                  nestDepth={nestDepth + 1}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Note">
        <div className="form-group">
          <label>Title</label>
          <input className="input" value={eTitle} onChange={(e) => setETitle(e.target.value)} autoFocus />
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea className="input textarea" value={eDesc} onChange={(e) => setEDesc(e.target.value)} rows={3} />
        </div>
        <div key={`dl-${editOpen}-${note.id}`}>
          <DeadlinePicker value={eDeadline} onChange={setEDeadline} timeOnly={!!note.daily} />
        </div>
        {allowParentEdit && (
          <div className="form-group">
            <label>Parent Note</label>
            <select
              className="input select"
              value={eParentId ?? ''}
              onChange={(e) => setEParentId(e.target.value || undefined)}
            >
              <option value="">None (top-level)</option>
              {parentOptions.map((n) => (
                <option key={n.id} value={n.id}>{n.title}</option>
              ))}
            </select>
          </div>
        )}
        <button type="button" className="btn btn-primary btn-full" onClick={handleSaveEdit}>Save</button>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete Note"
        message={`Delete "${note.title}"${childNotes.length > 0 ? ` and its ${childNotes.length} subnote(s)` : ''}? This cannot be undone.`}
        onConfirm={() => { setConfirmDelete(false); onDelete(note.id); }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
