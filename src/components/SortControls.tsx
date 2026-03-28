import type { SortField, SortDir } from '../types';

interface Props {
  field: SortField;
  dir: SortDir;
  onFieldChange: (f: SortField) => void;
  onDirChange: (d: SortDir) => void;
  showProgress?: boolean;
  showType?: boolean;
  showCompletedAt?: boolean;
}

export function SortControls({ field, dir, onFieldChange, onDirChange, showProgress, showType, showCompletedAt }: Props) {
  return (
    <div className="sort-controls">
      <label>Sort by</label>
      <select className="input select" value={field} onChange={(e) => onFieldChange(e.target.value as SortField)}>
        <option value="title">Title</option>
        <option value="deadline">Deadline</option>
        <option value="createdAt">Created</option>
        {showCompletedAt && <option value="completedAt">Completed</option>}
        {showProgress && <option value="progress">Progress</option>}
        {showType && <option value="type">Type</option>}
      </select>
      <button className="btn btn-sm" onClick={() => onDirChange(dir === 'asc' ? 'desc' : 'asc')}>
        {dir === 'asc' ? '↑' : '↓'}
      </button>
    </div>
  );
}
