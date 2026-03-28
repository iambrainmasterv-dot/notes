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
          Jarvis runs on Ollama (no API key). Session-only chat. With <strong>Allow edits</strong> on, clear edit requests
          can apply at once; otherwise you&apos;ll see <strong>Accept</strong> / <strong>Deny</strong> /{' '}
          <strong>Redo</strong> on proposed changes. Jarvis can undo recent actions on request.
        </p>
      </header>
      <AssistantPanel {...props} compact={false} />
    </div>
  );
}
