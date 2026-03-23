import { useState } from 'react';
import type { Task } from '../types';
import { ProgressBar } from './ProgressBar';
import { DeadlineBadge } from './DeadlineBadge';
import { ConfirmDialog } from './ConfirmDialog';
import { ItemOriginBadges } from './ItemOriginBadges';
import { isExpired, itemOriginCardClass } from '../utils';

interface Props {
  task: Task;
  now: number;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TaskCard({ task, now, onUpdate, onComplete, onDelete }: Props) {
  const [customVal, setCustomVal] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fromTemplate = Boolean(task.sourceScheduleTemplateId);
  const expired = !task.completed && isExpired(task.deadline, now);

  const setProgress = (val: number) => {
    onUpdate(task.id, { progress: Math.max(0, Math.min(val, task.target)) });
  };

  const addProgress = (amount: number) => {
    setProgress(task.progress + amount);
  };

  const originClass = itemOriginCardClass(task.daily, fromTemplate);

  return (
    <div className={`card ${originClass} ${expired ? 'card-expired' : ''} ${task.completed ? 'card-completed' : ''}`}>
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

      <ProgressBar progress={task.progress} target={task.target} />

      {!task.completed && (
        <div className="task-controls">
          <button className="btn btn-sm btn-ghost" onClick={() => addProgress(-1)}>−1</button>
          <button className="btn btn-sm btn-ghost" onClick={() => addProgress(1)}>+1</button>
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
        {!task.completed && (
          <button className="btn btn-ghost btn-complete" onClick={() => onComplete(task.id)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Complete
          </button>
        )}
        <button className="btn btn-ghost btn-delete" onClick={() => setConfirmDelete(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Delete
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete Task"
        message={`Delete "${task.title}"? This cannot be undone.`}
        onConfirm={() => { setConfirmDelete(false); onDelete(task.id); }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
