interface Props {
  progress: number;
  target: number;
  compact?: boolean;
}

export function ProgressBar({ progress, target, compact }: Props) {
  const pct = target > 0 ? Math.min((progress / target) * 100, 100) : 0;
  const isComplete = pct >= 100;

  if (compact) {
    return (
      <span className={`progress-pill ${isComplete ? 'progress-pill-done' : ''}`}>
        {progress}/{target}
      </span>
    );
  }

  return (
    <div className="progress-bar-track">
      <div
        className={`progress-bar-fill ${isComplete ? 'progress-bar-complete' : ''}`}
        style={{ width: `${pct}%` }}
      />
      <span className="progress-bar-label">
        {progress} / {target}
      </span>
    </div>
  );
}
