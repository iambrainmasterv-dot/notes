import type { DeadlineState } from '../types';
import { getDeadlineState } from '../utils';

interface Props {
  deadline: string;
  now: number;
}

const SEVERITY_CLASS: Record<DeadlineState['severity'], string> = {
  ok: 'badge-ok',
  soon: 'badge-soon',
  urgent: 'badge-urgent',
  expired: 'badge-expired',
};

export function DeadlineBadge({ deadline, now }: Props) {
  const state = getDeadlineState(deadline, now);
  return (
    <span className={`badge ${SEVERITY_CLASS[state.severity]}`}>
      {state.expired ? 'Expired' : state.label}
    </span>
  );
}
