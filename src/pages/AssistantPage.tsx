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
          Choose <strong>Chat</strong> for open conversation, or <strong>Edit</strong> so I can read and change your notes,
          tasks, and schedule. Session-only; use <strong>Edit</strong> for data changes.
        </p>
      </header>
      <AssistantPanel {...props} compact={false} />
    </div>
  );
}
