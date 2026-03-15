import { useState, useMemo } from 'react';
import type { Note } from '../types';
import { isExpired } from '../utils';
import { DeadlineBadge } from './DeadlineBadge';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  note: Note;
  allNotes: Note[];
  now: number;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleCollapse: (id: string) => void;
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
  onMouseDown,
  style,
  className = '',
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const expired = isExpired(note.deadline, now);
  const childNotes = useMemo(
    () => allNotes.filter((n) => n.parentId === note.id),
    [allNotes, note.id],
  );

  return (
    <div
      className={`card ${expired ? 'card-expired' : ''} ${className}`}
      style={style}
      onMouseDown={onMouseDown}
    >
      <div className="card-header">
        <h3 className="card-title">{note.title}</h3>
        {note.daily && <span className="badge badge-daily">daily</span>}
        {note.deadline && <DeadlineBadge deadline={note.deadline} now={now} />}
      </div>

      {note.description && <p className="card-desc">{note.description}</p>}

      {note.parentId && (
        <span className="badge badge-parent">
          ↳ {allNotes.find((n) => n.id === note.parentId)?.title ?? 'Parent'}
        </span>
      )}

      <div className="card-actions">
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
            <div className="subnotes-list">
              {childNotes.map((child) => (
                <NoteCard
                  key={child.id}
                  note={child}
                  allNotes={allNotes}
                  now={now}
                  onComplete={onComplete}
                  onDelete={onDelete}
                  onToggleCollapse={onToggleCollapse}
                />
              ))}
            </div>
          )}
        </div>
      )}

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
