import { useState, useMemo, useEffect } from 'react';
import type { Note, Task } from '../types';
import {
  isExpired,
  collectBlockedIdsForReparent,
  itemOriginCardClass,
  childrenOf,
  buildParentPickerOptions,
  parseParentPickerValue,
  parentTitleForItem,
  effectiveNoteParentType,
  collectDescendantIds,
} from '../utils';
import { DeadlineBadge } from './DeadlineBadge';
import { ConfirmDialog } from './ConfirmDialog';
import { Modal } from './Modal';
import { DeadlinePicker } from './DeadlinePicker';
import { ItemOriginBadges } from './ItemOriginBadges';
import { SubItemModal } from './SubItemModal';
import { TaskCard } from './TaskCard';
import { useAndroidPinControls } from '../notifications/AndroidPinContext';
import { isPinned, togglePinned } from '../notifications/pinsStorage';
import { dismissPinNotification } from '../notifications/notificationActionHandler';
import { useAssistantJarvisReady } from '../context/AssistantJarvisReadyContext';
import { copyItemToClipboard } from '../utils/itemClipboardExport';

interface Props {
  note: Note;
  allNotes: Note[];
  allTasks: Task[];
  now: number;
  onCompleteNote: (id: string) => void;
  onCompleteTask: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onUpdateNote: (id: string, patch: Partial<Note>) => void;
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
  addNote: (data: Omit<Note, 'id' | 'type' | 'completed' | 'createdAt'>) => void;
  addTask: (data: Omit<Task, 'id' | 'type' | 'completed' | 'createdAt' | 'progress'>) => void;
  allowParentEdit?: boolean;
  nestDepth?: number;
  /** When false, subitems are rendered as siblings (e.g. masonry list); collapse still toggles visibility in the flat list. */
  embedSubitems?: boolean;
  onMouseDown?: React.MouseEventHandler<HTMLDivElement>;
  style?: React.CSSProperties;
  className?: string;
}

export function NoteCard({
  note,
  allNotes,
  allTasks,
  now,
  onCompleteNote,
  onCompleteTask,
  onDeleteNote,
  onDeleteTask,
  onToggleCollapse,
  onUpdateNote,
  onUpdateTask,
  addNote,
  addTask,
  allowParentEdit = false,
  nestDepth = 0,
  embedSubitems = true,
  onMouseDown,
  style,
  className = '',
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [eTitle, setETitle] = useState('');
  const [eDesc, setEDesc] = useState('');
  const [eDeadline, setEDeadline] = useState<string | undefined>();
  const [eParentVal, setEParentVal] = useState('');
  const [subModal, setSubModal] = useState<'note' | 'task' | null>(null);
  const { supported: androidPin, notifyPinsChanged } = useAndroidPinControls();
  const jarvisReady = useAssistantJarvisReady();
  const [pinOn, setPinOn] = useState(() => isPinned('note', note.id));
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);

  const fromTemplate = Boolean(note.sourceScheduleTemplateId);
  const expired = !note.completed && isExpired(note.deadline, now);

  const { childNotes, childTasks } = useMemo(
    () => childrenOf({ type: 'note', id: note.id }, allNotes, allTasks),
    [note.id, allNotes, allTasks],
  );
  const childCount = childNotes.length + childTasks.length;

  const blockedIds = useMemo(
    () => collectBlockedIdsForReparent('note', note.id, allNotes, allTasks),
    [note.id, allNotes, allTasks],
  );
  const parentPickerOpts = useMemo(
    () =>
      buildParentPickerOptions(allNotes, allTasks, {
        excludeIds: blockedIds,
        dailyOnly: !!note.daily,
      }),
    [allNotes, allTasks, blockedIds, note.daily],
  );

  const descCounts = useMemo(() => {
    const { noteIds, taskIds } = collectDescendantIds('note', note.id, allNotes, allTasks);
    return noteIds.length + taskIds.length;
  }, [note.id, allNotes, allTasks]);

  useEffect(() => {
    if (!editOpen) return;
    setETitle(note.title);
    setEDesc(note.description);
    setEDeadline(note.deadline);
    const pt = effectiveNoteParentType(note);
    setEParentVal(note.parentId && pt ? `${pt}:${note.parentId}` : '');
  }, [editOpen, note.id, note.title, note.description, note.deadline, note.parentId, note.parentType]);

  useEffect(() => {
    setPinOn(isPinned('note', note.id));
  }, [note.id]);

  useEffect(() => {
    if (!copyHint || copyHint.endsWith('…')) return;
    const t = window.setTimeout(() => setCopyHint(null), 3200);
    return () => window.clearTimeout(t);
  }, [copyHint]);

  const handleCopy = async () => {
    if (copyBusy) return;
    setCopyBusy(true);
    setCopyHint(jarvisReady ? 'Formatting with Jarvis…' : 'Copying…');
    try {
      await copyItemToClipboard({
        rootType: 'note',
        root: note,
        allNotes,
        allTasks,
        jarvisReady,
      });
      setCopyHint('Copied to clipboard');
    } catch (e) {
      setCopyHint(e instanceof Error ? e.message : 'Copy failed');
    } finally {
      setCopyBusy(false);
    }
  };

  const handleSaveEdit = () => {
    if (!eTitle.trim()) return;
    const patch: Partial<Note> = {
      title: eTitle.trim(),
      description: eDesc.trim(),
      deadline: eDeadline,
    };
    if (allowParentEdit) {
      const parsed = eParentVal ? parseParentPickerValue(eParentVal) : null;
      if (parsed) {
        patch.parentId = parsed.id;
        patch.parentType = parsed.type;
      } else {
        patch.parentId = undefined;
        patch.parentType = undefined;
      }
    }
    onUpdateNote(note.id, patch);
    setEditOpen(false);
  };

  const originClass = itemOriginCardClass(note.daily, fromTemplate);
  const depthClass = nestDepth > 0 ? `note-card-nested note-depth-${Math.min(nestDepth, 4)}` : '';
  const pt = effectiveNoteParentType(note);
  const parentTitle = parentTitleForItem(allNotes, allTasks, note.parentId, pt);

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

      {note.parentId && parentTitle && (
        <div className="badge-parent-wrap">
          <span className="badge badge-parent badge-parent-ellipsis" title={parentTitle}>
            ↳ {parentTitle}
          </span>
        </div>
      )}

      <div className="card-actions">
        <button type="button" className="btn btn-ghost btn-sm btn-icon-action" onClick={() => setEditOpen(true)} title="Edit note">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-icon-action"
          onClick={() => void handleCopy()}
          disabled={copyBusy}
          title={jarvisReady ? 'Copy (Jarvis-formatted for other AIs)' : 'Copy as plain text'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Copy
        </button>
        {androidPin && !note.completed && (
          <button
            type="button"
            className={`btn btn-ghost btn-sm btn-icon-action ${pinOn ? 'active' : ''}`}
            title={pinOn ? 'Unpin from notification shade' : 'Pin to notification shade'}
            onClick={() => {
              const wasPinned = isPinned('note', note.id);
              togglePinned('note', note.id);
              setPinOn(!wasPinned);
              if (wasPinned) void dismissPinNotification('note', note.id);
              notifyPinsChanged();
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M12 17v5M9 10V7a3 3 0 0 1 6 0v3M5 10h14v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V10z" />
            </svg>
            {pinOn ? 'Pinned' : 'Pin'}
          </button>
        )}
        {!note.completed && (
          <>
            <button type="button" className="btn btn-ghost btn-sm btn-icon-action" onClick={() => setSubModal('note')} title="Add subnote under this note">
              + Note
            </button>
            <button type="button" className="btn btn-ghost btn-sm btn-icon-action" onClick={() => setSubModal('task')} title="Add subtask under this note">
              + Task
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-complete btn-sm btn-icon-only"
              onClick={() => onCompleteNote(note.id)}
              title="Mark complete"
              aria-label="Mark note complete"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><polyline points="20 6 9 17 4 12"/></svg>
            </button>
          </>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-delete btn-sm btn-icon-only"
          onClick={() => setConfirmDelete(true)}
          title="Delete note"
          aria-label="Delete note"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        {copyHint && (
          <p className="card-copy-hint" role="status">
            {copyHint}
          </p>
        )}
      </div>

      {childCount > 0 && (
        <div className="subnotes">
          <button type="button" className="btn-text" onClick={() => onToggleCollapse(note.id)}>
            {note.collapsed ? `▸ ${childCount} subitems` : `▾ ${childCount} subitems`}
          </button>
          {!note.collapsed && embedSubitems && (
            <div className="subnotes-list subnotes-list--tree">
              {childNotes.map((child) => (
                <NoteCard
                  key={child.id}
                  note={child}
                  allNotes={allNotes}
                  allTasks={allTasks}
                  now={now}
                  onCompleteNote={onCompleteNote}
                  onCompleteTask={onCompleteTask}
                  onDeleteNote={onDeleteNote}
                  onDeleteTask={onDeleteTask}
                  onToggleCollapse={onToggleCollapse}
                  onUpdateNote={onUpdateNote}
                  onUpdateTask={onUpdateTask}
                  addNote={addNote}
                  addTask={addTask}
                  allowParentEdit={allowParentEdit}
                  nestDepth={nestDepth + 1}
                  embedSubitems={embedSubitems}
                />
              ))}
              {childTasks.map((child) => (
                <TaskCard
                  key={child.id}
                  task={child}
                  allNotes={allNotes}
                  allTasks={allTasks}
                  now={now}
                  onUpdate={onUpdateTask}
                  onUpdateNote={onUpdateNote}
                  onCompleteNote={onCompleteNote}
                  onCompleteTask={onCompleteTask}
                  onDeleteNote={onDeleteNote}
                  onDeleteTask={onDeleteTask}
                  onToggleCollapse={onToggleCollapse}
                  addNote={addNote}
                  addTask={addTask}
                  allowParentEdit={allowParentEdit}
                  nestDepth={nestDepth + 1}
                  embedSubitems={embedSubitems}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <SubItemModal
        open={subModal !== null}
        mode={subModal === 'task' ? 'task' : 'note'}
        parentType="note"
        parentId={note.id}
        dailyBranch={!!note.daily}
        onClose={() => setSubModal(null)}
        onCreateNote={(d) => addNote(d)}
        onCreateTask={(d) => addTask(d)}
      />

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
            <label>Parent</label>
            <select className="input select" value={eParentVal} onChange={(e) => setEParentVal(e.target.value)}>
              <option value="">None (top-level)</option>
              {parentPickerOpts.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )}
        <button type="button" className="btn btn-primary btn-full" onClick={handleSaveEdit}>Save</button>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete Note"
        message={`Delete "${note.title}"${descCounts > 0 ? ` and ${descCounts} nested item(s)` : ''}? This cannot be undone.`}
        onConfirm={() => { setConfirmDelete(false); onDeleteNote(note.id); }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
