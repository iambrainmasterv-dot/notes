import { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import type { Note, Task } from '../types';
import { ProgressBar } from './ProgressBar';
import { DeadlineBadge } from './DeadlineBadge';
import { ConfirmDialog } from './ConfirmDialog';
import { ItemOriginBadges } from './ItemOriginBadges';
import { isExpired, itemOriginCardClass, childrenOf, buildParentPickerOptions, parseParentPickerValue, parentTitleForItem, collectBlockedIdsForReparent, collectDescendantIds, effectiveTaskParentType } from '../utils';
import { Modal } from './Modal';
import { DeadlinePicker } from './DeadlinePicker';
import { SubItemModal } from './SubItemModal';
import { useAndroidPinControls } from '../notifications/AndroidPinContext';
import { isPinned, togglePinned } from '../notifications/pinsStorage';
import { dismissPinNotification } from '../notifications/notificationActionHandler';
import { useAssistantJarvisReady } from '../context/AssistantJarvisReadyContext';
import { copyItemToClipboard } from '../utils/itemClipboardExport';

const NoteCardLazy = lazy(() => import('./NoteCard').then((m) => ({ default: m.NoteCard })));

interface Props {
  task: Task;
  allNotes: Note[];
  allTasks: Task[];
  now: number;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onUpdateNote: (id: string, patch: Partial<Note>) => void;
  onCompleteNote: (id: string) => void;
  onCompleteTask: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  addNote: (data: Omit<Note, 'id' | 'type' | 'completed' | 'createdAt'>) => void;
  addTask: (data: Omit<Task, 'id' | 'type' | 'completed' | 'createdAt' | 'progress'>) => void;
  allowParentEdit?: boolean;
  nestDepth?: number;
  embedSubitems?: boolean;
  onMouseDown?: React.MouseEventHandler<HTMLDivElement>;
  style?: React.CSSProperties;
  className?: string;
}

export function TaskCard({
  task,
  allNotes,
  allTasks,
  now,
  onUpdate,
  onUpdateNote,
  onCompleteNote,
  onCompleteTask,
  onDeleteNote,
  onDeleteTask,
  onToggleCollapse,
  addNote,
  addTask,
  allowParentEdit = false,
  nestDepth = 0,
  embedSubitems = true,
  onMouseDown,
  style,
  className = '',
}: Props) {
  const [customVal, setCustomVal] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [eTitle, setETitle] = useState('');
  const [eDesc, setEDesc] = useState('');
  const [eDeadline, setEDeadline] = useState<string | undefined>();
  const [eReminderMin, setEReminderMin] = useState(10);
  const [eTarget, setETarget] = useState(10);
  const [eParentVal, setEParentVal] = useState('');
  const [subModal, setSubModal] = useState<'note' | 'task' | null>(null);
  const [subExpanded, setSubExpanded] = useState(true);
  const { supported: androidPin, notifyPinsChanged } = useAndroidPinControls();
  const jarvisReady = useAssistantJarvisReady();
  const [pinOn, setPinOn] = useState(() => isPinned('task', task.id));
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);

  const fromTemplate = Boolean(task.sourceScheduleTemplateId);
  const expired = !task.completed && isExpired(task.deadline, now);

  const { childNotes, childTasks } = useMemo(
    () => childrenOf({ type: 'task', id: task.id }, allNotes, allTasks),
    [task.id, allNotes, allTasks],
  );
  const childCount = childNotes.length + childTasks.length;

  const blockedIds = useMemo(
    () => collectBlockedIdsForReparent('task', task.id, allNotes, allTasks),
    [task.id, allNotes, allTasks],
  );
  const parentPickerOpts = useMemo(
    () =>
      buildParentPickerOptions(allNotes, allTasks, {
        excludeIds: blockedIds,
        dailyOnly: !!task.daily,
      }),
    [allNotes, allTasks, blockedIds, task.daily],
  );

  const descCounts = useMemo(() => {
    const { noteIds, taskIds } = collectDescendantIds('task', task.id, allNotes, allTasks);
    return noteIds.length + taskIds.length;
  }, [task.id, allNotes, allTasks]);

  useEffect(() => {
    if (!editOpen) return;
    setETitle(task.title);
    setEDesc(task.description);
    setEDeadline(task.deadline);
    setEReminderMin(task.reminderMinutesBefore ?? 10);
    setETarget(task.target);
    const pt = effectiveTaskParentType(task);
    setEParentVal(task.parentId && pt ? `${pt}:${task.parentId}` : '');
  }, [editOpen, task]);

  useEffect(() => {
    setPinOn(isPinned('task', task.id));
  }, [task.id]);

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
        rootType: 'task',
        root: task,
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

  const setProgress = (val: number) => {
    onUpdate(task.id, { progress: Math.max(0, Math.min(val, task.target)) });
  };

  const addProgress = (amount: number) => {
    setProgress(task.progress + amount);
  };

  const originClass = itemOriginCardClass(task.daily, fromTemplate);
  const depthClass = nestDepth > 0 ? `note-card-nested note-depth-${Math.min(nestDepth, 4)}` : '';
  const pt = effectiveTaskParentType(task);
  const parentTitle = parentTitleForItem(allNotes, allTasks, task.parentId, pt);

  const handleSaveEdit = () => {
    if (!eTitle.trim() || eTarget < 1) return;
    const patch: Partial<Task> = {
      title: eTitle.trim(),
      description: eDesc.trim(),
      deadline: eDeadline,
      target: eTarget,
      reminderMinutesBefore: eDeadline ? eReminderMin : undefined,
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
    onUpdate(task.id, patch);
    setEditOpen(false);
  };

  return (
    <div
      className={`card ${originClass} ${depthClass} ${expired ? 'card-expired' : ''} ${task.completed ? 'card-completed' : ''} ${className}`}
      style={style}
      onMouseDown={onMouseDown}
    >
      <div className="card-header">
        <h3 className="card-title">{task.title}</h3>
        <div className="card-header-badges">
          <ItemOriginBadges daily={task.daily} fromTemplate={fromTemplate} />
          {task.deadline && (
            <DeadlineBadge deadline={task.deadline} now={now} completed={task.completed} />
          )}
        </div>
      </div>

      {task.description && <p className="card-desc">{task.description}</p>}

      {task.parentId && parentTitle && (
        <div className="badge-parent-wrap">
          <span className="badge badge-parent badge-parent-ellipsis" title={parentTitle}>
            ↳ {parentTitle}
          </span>
        </div>
      )}

      <ProgressBar progress={task.progress} target={task.target} />

      {!task.completed && (
        <div className="task-controls">
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => addProgress(-1)}>−1</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => addProgress(1)}>+1</button>
          <input
            type="number"
            className="input input-sm"
            placeholder="+n"
            value={customVal}
            onChange={(e) => setCustomVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && customVal !== '') {
                addProgress(Number(customVal));
                setCustomVal('');
              }
            }}
          />
          <input
            type="range"
            className="slider"
            min={0}
            max={task.target}
            value={task.progress}
            onChange={(e) => setProgress(Number(e.target.value))}
          />
        </div>
      )}

      <div className="card-actions">
        <button type="button" className="btn btn-ghost btn-sm btn-icon-action" onClick={() => setEditOpen(true)} title="Edit task">
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
        {androidPin && !task.completed && (
          <button
            type="button"
            className={`btn btn-ghost btn-sm btn-icon-action btn-pin-notify ${pinOn ? 'is-pinned' : ''}`}
            title={pinOn ? 'Unpin from notification shade' : 'Pin to notification shade'}
            onClick={() => {
              const wasPinned = isPinned('task', task.id);
              togglePinned('task', task.id);
              setPinOn(!wasPinned);
              if (wasPinned) void dismissPinNotification('task', task.id);
              notifyPinsChanged();
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M12 17v5M9 10V7a3 3 0 0 1 6 0v3M5 10h14v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V10z" />
            </svg>
            {pinOn ? 'Pinned' : 'Pin'}
          </button>
        )}
        {!task.completed && (
          <>
            <button type="button" className="btn btn-ghost btn-sm btn-icon-action" onClick={() => setSubModal('note')} title="Add subnote under this task">
              + Note
            </button>
            <button type="button" className="btn btn-ghost btn-sm btn-icon-action" onClick={() => setSubModal('task')} title="Add subtask under this task">
              + Task
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-complete btn-sm btn-icon-only"
              onClick={() => onCompleteTask(task.id)}
              title="Mark complete"
              aria-label="Mark task complete"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><polyline points="20 6 9 17 4 12"/></svg>
            </button>
          </>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-delete btn-sm btn-icon-only"
          onClick={() => setConfirmDelete(true)}
          title="Delete task"
          aria-label="Delete task"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        {copyHint && (
          <p className="card-copy-hint" role="status">
            {copyHint}
          </p>
        )}
      </div>

      {childCount > 0 && embedSubitems && (
        <div className="subnotes">
          <button type="button" className="btn-text" onClick={() => setSubExpanded((e) => !e)}>
            {subExpanded ? `▾ ${childCount} subitems` : `▸ ${childCount} subitems`}
          </button>
          {subExpanded && (
            <div className="subnotes-list subnotes-list--tree">
              <Suspense fallback={<div className="text-muted" style={{ padding: 8 }}>Loading…</div>}>
                {childNotes.map((child) => (
                  <NoteCardLazy
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
                    onUpdateTask={onUpdate}
                    addNote={addNote}
                    addTask={addTask}
                    allowParentEdit={allowParentEdit}
                    nestDepth={nestDepth + 1}
                    embedSubitems={embedSubitems}
                  />
                ))}
              </Suspense>
              {childTasks.map((child) => (
                <TaskCard
                  key={child.id}
                  task={child}
                  allNotes={allNotes}
                  allTasks={allTasks}
                  now={now}
                  onUpdate={onUpdate}
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
        parentType="task"
        parentId={task.id}
        dailyBranch={!!task.daily}
        onClose={() => setSubModal(null)}
        onCreateNote={(d) => addNote(d)}
        onCreateTask={(d) => addTask(d)}
      />

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Task">
        <div className="form-group">
          <label>Title</label>
          <input className="input" value={eTitle} onChange={(e) => setETitle(e.target.value)} autoFocus />
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea className="input textarea" value={eDesc} onChange={(e) => setEDesc(e.target.value)} rows={3} />
        </div>
        <div className="form-group">
          <label>Target amount</label>
          <input className="input" type="number" min={1} value={eTarget} onChange={(e) => setETarget(Number(e.target.value))} />
        </div>
        <div key={`dl-${editOpen}-${task.id}`}>
          <DeadlinePicker
            value={eDeadline}
            onChange={setEDeadline}
            timeOnly={!!task.daily}
            reminderMinutesBefore={eReminderMin}
            onReminderMinutesChange={setEReminderMin}
          />
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
        title="Delete Task"
        message={`Delete "${task.title}"${descCounts > 0 ? ` and ${descCounts} nested item(s)` : ''}? This cannot be undone.`}
        onConfirm={() => { setConfirmDelete(false); onDeleteTask(task.id); }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
