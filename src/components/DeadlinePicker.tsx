import { useState } from 'react';
import { toLocalInputValue } from '../utils';

interface Props {
  value?: string;
  onChange: (val?: string) => void;
  timeOnly?: boolean;
}

export function DeadlinePicker({ value, onChange, timeOnly }: Props) {
  const [enabled, setEnabled] = useState(!!value);

  return (
    <div className="deadline-picker">
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            if (!e.target.checked) onChange(undefined);
          }}
        />
        <span>Set deadline{timeOnly ? ' (time)' : ''}</span>
      </label>
      {enabled && (
        <input
          type={timeOnly ? 'time' : 'datetime-local'}
          className="input"
          value={timeOnly ? (value ?? '') : (value ? toLocalInputValue(value) : '')}
          onChange={(e) => {
            if (!e.target.value) return;
            onChange(e.target.value);
          }}
        />
      )}
    </div>
  );
}
