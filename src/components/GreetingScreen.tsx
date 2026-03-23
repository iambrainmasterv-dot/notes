import { createPortal } from 'react-dom';
import type { ScheduleTemplate } from '../types';
import { APP_VERSION } from '../version';

interface Props {
  open: boolean;
  onGetToWork: () => void;
  todayLabel: string;
  lastVisitLine: string | null;
  expiredCount: number;
  templatesToday: ScheduleTemplate[];
}

export function GreetingScreen({
  open,
  onGetToWork,
  todayLabel,
  lastVisitLine,
  expiredCount,
  templatesToday,
}: Props) {
  if (!open) return null;

  return createPortal(
    <div className="greeting-overlay" role="dialog" aria-modal="true" aria-labelledby="greeting-title">
      <div className="greeting-card">
        <div className="greeting-brand">
          <div className="brand-mark">N</div>
          <div>
            <h2 id="greeting-title" className="greeting-title">Welcome back</h2>
            <p className="greeting-sub text-muted">NoteTasks v{APP_VERSION}</p>
          </div>
        </div>

        <p className="greeting-today">{todayLabel}</p>

        {lastVisitLine && <p className="greeting-line">{lastVisitLine}</p>}

        <p className="greeting-line">
          {expiredCount === 0
            ? 'No active notes or tasks are past their deadline.'
            : `${expiredCount} active ${expiredCount === 1 ? 'item has' : 'items have'} an expired deadline.`}
        </p>

        {templatesToday.length > 0 && (
          <div className="greeting-templates">
            <p className="greeting-templates-label">Today&apos;s schedule templates</p>
            <ul className="greeting-template-list">
              {templatesToday.map((tpl) => (
                <li key={tpl.id} className="greeting-template-item">
                  <span className="greeting-template-name">{tpl.name}</span>
                  <ul className="greeting-template-items">
                    {tpl.items.slice(0, 8).map((it) => (
                      <li key={it.id}>
                        <span className={`type-tag type-${it.type}`}>{it.type}</span>{' '}
                        {it.title}
                      </li>
                    ))}
                    {tpl.items.length > 8 && (
                      <li className="text-muted">+{tpl.items.length - 8} more…</li>
                    )}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button type="button" className="btn btn-primary btn-full greeting-cta" onClick={onGetToWork}>
          Get to work
        </button>
      </div>
    </div>,
    document.body,
  );
}
