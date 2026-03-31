import { useState } from 'react';
import { toLocalInputValue } from '../utils';
import { DEFAULT_DEADLINE_REMINDER_MINUTES } from '../notifications/rules';

interface Props {
  value?: string;
  onChange: (val?: string) => void;
  timeOnly?: boolean;
  /** Shown when deadline is enabled; default 10 when omitted. */
  reminderMinutesBefore?: number;
  onReminderMinutesChange?: (minutes: number) => void;
}

const REMINDER_CHOICES: { value: number; label: string }[] = [
  { value: 0, label: 'At due time only' },
  { value: 5, label: '5 minutes before' },
  { value: 10, label: '10 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
];

export function DeadlinePicker({
  value,
  onChange,
  timeOnly,
  reminderMinutesBefore,
  onReminderMinutesChange,
}: Props) {
  const [enabled, setEnabled] = useState(!!value);
  const rem = reminderMinutesBefore ?? DEFAULT_DEADLINE_REMINDER_MINUTES;

  return (
    <div className="deadline-picker">
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            if (!e.target.checked) {
              onChange(undefined);
              onReminderMinutesChange?.(DEFAULT_DEADLINE_REMINDER_MINUTES);
            } else {
              onReminderMinutesChange?.(reminderMinutesBefore ?? DEFAULT_DEADLINE_REMINDER_MINUTES);
            }
          }}
        />
        <span>Set deadline{timeOnly ? ' (time)' : ''}</span>
      </label>
      {enabled && (
        <>
          <input
            type={timeOnly ? 'time' : 'datetime-local'}
            className="input"
            value={timeOnly ? (value ?? '') : (value ? toLocalInputValue(value) : '')}
            onChange={(e) => {
              if (!e.target.value) return;
              onChange(e.target.value);
            }}
          />
          {onReminderMinutesChange && (
            <div className="form-group" style={{ marginTop: 10 }}>
              <label>Push reminder (Android)</label>
              <select
                className="input select"
                value={REMINDER_CHOICES.some((c) => c.value === rem) ? rem : 10}
                onChange={(e) => onReminderMinutesChange(Number(e.target.value))}
              >
                {REMINDER_CHOICES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}
    </div>
  );
}
