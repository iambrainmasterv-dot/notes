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
          Session-only chat. Turn on <strong>Allow edits</strong> under <strong>Settings</strong> → <strong>Jarvis</strong> so
          I can change your data. Clear requests may apply right away; vague ones show <strong>Accept</strong>,{' '}
          <strong>Deny</strong>, and <strong>Redo</strong>. Ask me to undo if something went wrong.
        </p>
      </header>
      <AssistantPanel {...props} compact={false} />
    </div>
  );
}
