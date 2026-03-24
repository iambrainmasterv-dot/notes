import type { TutorialStep } from '../hooks/useTutorial';

interface Props {
  open: boolean;
  step: TutorialStep;
  stepIndex: number;
  total: number;
  onNext: () => void;
  onSkipTab: () => void;
  onFinish: () => void;
  isLast: boolean;
  canGoNext: boolean;
  showSkipToNextTab: boolean;
  interactive: boolean;
  gateHint?: string;
}

export function TutorialOverlay({
  open,
  step,
  stepIndex,
  total,
  onNext,
  onSkipTab,
  onFinish,
  isLast,
  canGoNext,
  showSkipToNextTab,
  interactive,
  gateHint,
}: Props) {
  if (!open) return null;

  return (
    <div
      className={`tutorial-overlay ${interactive ? 'tutorial-overlay--interactive' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-title"
    >
      <div className="tutorial-card">
        <p className="tutorial-progress">
          Step {stepIndex + 1} / {total}
        </p>
        <h2 id="tutorial-title" className="tutorial-title">{step.title}</h2>
        <p className="tutorial-body">{step.body}</p>
        {gateHint && (
          <p className="tutorial-gate-hint" role="status">{gateHint}</p>
        )}
        <div className={`tutorial-actions ${!showSkipToNextTab ? 'tutorial-actions--no-skip' : ''}`}>
          {showSkipToNextTab && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onSkipTab}>
              Skip to next tab
            </button>
          )}
          <div className="tutorial-actions-right">
            {!isLast && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={onNext}
                disabled={!canGoNext}
              >
                Next
              </button>
            )}
            <button type="button" className="btn btn-primary btn-sm" onClick={onFinish}>
              {isLast ? 'Done' : 'Finish early'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
