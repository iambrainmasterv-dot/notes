import { useId, useLayoutEffect, useRef, useState, useCallback } from 'react';
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

const PAD = 8;

type Rect = { x: number; y: number; w: number; h: number };

function gatherTargetRects(targets: string[] | undefined): Rect[] {
  if (!targets?.length) return [];
  const out: Rect[] = [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  for (const id of targets) {
    const nodes = document.querySelectorAll(`[data-tutorial-target="${id}"]`);
    nodes.forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      const r = node.getBoundingClientRect();
      if (r.width < 2 && r.height < 2) return;
      const x = Math.max(0, r.left - PAD);
      const y = Math.max(0, r.top - PAD);
      const w = Math.min(vw - x, r.width + PAD * 2);
      const h = Math.min(vh - y, r.height + PAD * 2);
      out.push({ x, y, w, h });
    });
  }
  return out;
}

function computeCardPosition(
  cardW: number,
  cardH: number,
  rects: Rect[],
  vw: number,
  vh: number,
): { left: number; top: number } {
  const margin = 16;
  if (rects.length === 0) {
    return { left: (vw - cardW) / 2, top: vh - cardH - margin };
  }
  const modalRect = rects.find((r) => r.h > 220 || r.w > 360) ?? rects[rects.length - 1];
  const primary = modalRect;

  if (primary.x + primary.w / 2 < vw * 0.42) {
    const left = Math.min(vw - cardW - margin, primary.x + primary.w + margin);
    const top = Math.min(vh - cardH - margin, Math.max(margin, primary.y));
    if (left + cardW <= vw - margin) {
      return { left, top };
    }
  }

  let top = primary.y + primary.h + margin;
  if (top + cardH > vh - margin) {
    top = Math.max(margin, primary.y - cardH - margin);
  }
  let left = primary.x + primary.w / 2 - cardW / 2;
  left = Math.max(margin, Math.min(left, vw - cardW - margin));
  return { left, top };
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
  const maskId = useId().replace(/:/g, '');
  const cardRef = useRef<HTMLDivElement>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const [cardPos, setCardPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  const targets = step.highlightTargets;

  const [vp, setVp] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 800,
    h: typeof window !== 'undefined' ? window.innerHeight : 600,
  }));

  const updateLayout = useCallback(() => {
    if (!open) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setVp({ w: vw, h: vh });
    const nextRects = gatherTargetRects(targets);
    setRects(nextRects);
    const card = cardRef.current;
    const cw = Math.min(420, vw - 32);
    const ch = card?.offsetHeight ?? 200;
    setCardPos(computeCardPosition(cw, ch, nextRects, vw, vh));
  }, [open, targets]);

  useLayoutEffect(() => {
    if (!open) {
      setRects([]);
      return;
    }
    updateLayout();
    const ro = new ResizeObserver(() => updateLayout());
    if (cardRef.current) ro.observe(cardRef.current);
    const t = window.setTimeout(() => {
      updateLayout();
      requestAnimationFrame(updateLayout);
    }, 0);
    const onScroll = () => updateLayout();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', updateLayout);
    return () => {
      window.clearTimeout(t);
      ro.disconnect();
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', updateLayout);
    };
  }, [open, stepIndex, step.skipTabKey, updateLayout]);

  useLayoutEffect(() => {
    if (!open || !targets?.length) return;
    const els: HTMLElement[] = [];
    for (const id of targets) {
      document.querySelectorAll(`[data-tutorial-target="${id}"]`).forEach((n) => {
        if (n instanceof HTMLElement) els.push(n);
      });
    }
    els.forEach((el) => el.classList.add('tutorial-target-pulse'));
    return () => els.forEach((el) => el.classList.remove('tutorial-target-pulse'));
  }, [open, stepIndex, targets]);

  if (!open) return null;

  const hasSpotlight = Boolean(targets?.length);
  const showSpotlightLayer = interactive && hasSpotlight && rects.length > 0;
  const useFullDim = !interactive;

  return (
    <div
      className={`tutorial-root ${useFullDim ? 'tutorial-root--blocking' : ''}`}
      role="dialog"
      aria-modal={useFullDim}
      aria-labelledby="tutorial-title"
    >
      {useFullDim && <div className="tutorial-dim-full" aria-hidden />}

      {showSpotlightLayer && (
        <svg
          className="tutorial-spotlight-svg"
          width={vp.w}
          height={vp.h}
          viewBox={`0 0 ${vp.w} ${vp.h}`}
          aria-hidden
        >
          <defs>
            <mask id={maskId}>
              <rect width={vp.w} height={vp.h} fill="white" />
              {rects.map((r, i) => (
                <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={10} ry={10} fill="black" />
              ))}
            </mask>
          </defs>
          <rect width={vp.w} height={vp.h} fill="rgba(15, 23, 42, 0.52)" mask={`url(#${maskId})`} />
        </svg>
      )}

      <div
        ref={cardRef}
        className="tutorial-card"
        style={{ left: cardPos.left, top: cardPos.top }}
      >
        <p className="tutorial-progress">
          Step {stepIndex + 1} / {total}
        </p>
        <h2 id="tutorial-title" className="tutorial-title">{step.title}</h2>
        <p className="tutorial-body">{step.body}</p>
        {step.skipTabKey === 'jarvis' && (
          <p className="tutorial-body" style={{ marginTop: 10, marginBottom: 0 }}>
            <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer">
              Download Ollama
            </a>{' '}
            for Windows, macOS, or Linux.
          </p>
        )}
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
