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
      </header>
      <AssistantPanel {...props} compact={false} />
    </div>
  );
}
