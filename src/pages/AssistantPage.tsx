import { AssistantPanel } from '../components/AssistantPanel';
import type { AssistantPanelProps } from '../components/AssistantPanel';

type Props = Omit<AssistantPanelProps, 'onDismissError' | 'compact'> & {
  onDismissError: () => void;
};

export function AssistantPage(props: Props) {
  return (
    <div className="assistant-page">
      <header className="page-header">
        <h1 className="page-title">Assistant</h1>
        <p className="page-subtitle" style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Local Ollama-powered help (no API key). Session-only chat; data changes follow your Settings and confirmation
          rules.
        </p>
      </header>
      <AssistantPanel {...props} compact={false} />
    </div>
  );
}
