import { useState, useEffect } from 'react';
import type { ParentType } from '../types';
import { Modal } from './Modal';
import { DeadlinePicker } from './DeadlinePicker';

interface Props {
  open: boolean;
  mode: 'note' | 'task';
  parentType: ParentType;
  parentId: string;
  /** When true, new item is daily (parent is daily). */
  dailyBranch: boolean;
  onClose: () => void;
  onCreateNote: (data: {
    title: string;
    description: string;
    deadline?: string;
    parentId: string;
    parentType: ParentType;
    daily?: boolean;
  }) => void;
  onCreateTask: (data: {
    title: string;
    description: string;
    target: number;
    deadline?: string;
    parentId: string;
    parentType: ParentType;
    daily?: boolean;
  }) => void;
}

export function SubItemModal({
  open,
  mode,
  parentType,
  parentId,
  dailyBranch,
  onClose,
  onCreateNote,
  onCreateTask,
}: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState<string | undefined>();
  const [target, setTarget] = useState(10);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setDescription('');
    setDeadline(undefined);
    setTarget(10);
  }, [open, mode, parentId]);

  const handleSubmit = () => {
    if (!title.trim()) return;
    if (mode === 'note') {
      onCreateNote({
        title: title.trim(),
        description: description.trim(),
        deadline,
        parentId,
        parentType,
        daily: dailyBranch || undefined,
      });
    } else {
      if (target < 1) return;
      onCreateTask({
        title: title.trim(),
        description: description.trim(),
        target,
        deadline,
        parentId,
        parentType,
        daily: dailyBranch || undefined,
      });
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'note' ? 'New subnote' : 'New subtask'}
    >
      <div className="form-group">
        <label>Title</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>
      <div className="form-group">
        <label>Description</label>
        <textarea className="input textarea" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>
      {mode === 'task' && (
        <div className="form-group">
          <label>Target</label>
          <input className="input" type="number" min={1} value={target} onChange={(e) => setTarget(Number(e.target.value))} />
        </div>
      )}
      <div key={`dl-${open}-${dailyBranch}`}>
        <DeadlinePicker value={deadline} onChange={setDeadline} timeOnly={dailyBranch} />
      </div>
      <button type="button" className="btn btn-primary btn-full" onClick={handleSubmit}>
        Create
      </button>
    </Modal>
  );
}
