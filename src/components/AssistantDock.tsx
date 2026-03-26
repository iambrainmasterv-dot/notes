import { AssistantPanel } from './AssistantPanel';
import type { AssistantPanelProps } from './AssistantPanel';

type Props = AssistantPanelProps & {
  onClose: () => void;
};

export function AssistantDock({ onClose, ...panel }: Props) {
  return (
    <aside className="assistant-dock" aria-label="Jarvis side panel">
      <div className="assistant-dock-header">
        <span className="assistant-dock-title">Jarvis</span>
        <button type="button" className="btn btn-sm btn-ghost assistant-dock-close" onClick={onClose} aria-label="Close Jarvis panel">
          ×
        </button>
      </div>
      <AssistantPanel {...panel} compact />
    </aside>
  );
}
