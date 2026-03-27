import { AssistantPanel } from '../components/AssistantPanel';
import type { AssistantPanelProps } from '../components/AssistantPanel';

type Props = Omit<AssistantPanelProps, 'onDismissError' | 'compact'> & {
  onDismissError: () => void;
};

export function AssistantPage(props: Props) {
  return (
    <div className="assistant-page">
      <header className="page-header">
        <h1 className="page-title">Jarvis</h1>
        <p className="page-subtitle" style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Jarvis runs on Ollama (no API key). Session-only chat; with <strong>Allow edits</strong> on, changes apply
          immediately and Jarvis can undo recent actions on request.
        </p>
      </header>
      <AssistantPanel {...props} compact={false} />
    </div>
  );
}
