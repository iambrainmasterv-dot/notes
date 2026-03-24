import { useRef, useEffect } from 'react';
import type { AssistantChatMessage, AssistantPendingItem } from '../hooks/useAssistantChat';

export interface AssistantPanelProps {
  mutationsEnabled: boolean;
  messages: AssistantChatMessage[];
  pendingConfirmations: AssistantPendingItem[];
  pendingMutations: AssistantPendingItem[];
  loading: boolean;
  error: string | null;
  onSend: (text: string) => void;
  onExecute: (items: AssistantPendingItem[]) => void;
  onDismissError: () => void;
  /** Narrow dock layout */
  compact?: boolean;
}

export function AssistantPanel({
  mutationsEnabled,
  messages,
  pendingConfirmations,
  pendingMutations,
  loading,
  error,
  onSend,
  onExecute,
  onDismissError,
  compact,
}: AssistantPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingConfirmations, pendingMutations, loading]);

  const submit = () => {
    const el = inputRef.current;
    if (!el) return;
    const v = el.value.trim();
    if (!v || loading) return;
    el.value = '';
    onSend(v);
  };

  return (
    <div className={`assistant-panel ${compact ? 'assistant-panel--compact' : ''}`}>
      {!mutationsEnabled && (
        <p className="assistant-banner">
          AI cannot change your notes or tasks while <strong>Allow AI to edit data</strong> is off in Settings.
        </p>
      )}

      {error && (
        <div className="assistant-error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onDismissError}>
            Dismiss
          </button>
        </div>
      )}

      {(pendingMutations.length > 0 || pendingConfirmations.length > 0) && (
        <div className="assistant-pending assistant-pending--sticky">
          {pendingMutations.length > 0 && (
            <div className="assistant-pending-block">
              <div className="assistant-pending-title">Confirm changes</div>
              <p className="assistant-pending-hint">Tap Apply to save new or updated items to your account.</p>
              <ul className="assistant-pending-list">
                {pendingMutations.map((p) => (
                  <li key={p.id} className="assistant-pending-item">
                    <span className="assistant-pending-summary">{p.summary}</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={loading || !mutationsEnabled}
                      onClick={() => onExecute([p])}
                    >
                      Apply
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {pendingConfirmations.length > 0 && (
            <div className="assistant-pending-block">
              <div className="assistant-pending-title">Confirm deletion</div>
              <ul className="assistant-pending-list">
                {pendingConfirmations.map((p) => (
                  <li key={p.id} className="assistant-pending-item">
                    <span className="assistant-pending-summary">{p.summary}</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      disabled={loading || !mutationsEnabled}
                      onClick={() => {
                        if (!window.confirm(`Delete for good?\n\n${p.summary}`)) return;
                        onExecute([p]);
                      }}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="assistant-messages">
        {messages.length === 0 && !loading && (
          <p className="assistant-empty">
            Ask about your notes and tasks, or say e.g. “create a note …” / “write a task …”. If something needs a tap,
            you’ll see <strong>Confirm changes</strong> above the chat. Deletes always need confirmation here.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`assistant-bubble assistant-bubble--${m.role}`}>
            <div className="assistant-bubble-label">{m.role === 'user' ? 'You' : 'Assistant'}</div>
            <div className="assistant-bubble-text">{m.content}</div>
          </div>
        ))}
        {loading && (
          <div className="assistant-bubble assistant-bubble--assistant">
            <div className="assistant-bubble-label">Assistant</div>
            <div className="assistant-bubble-text assistant-typing">Thinking…</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="assistant-input-row">
        <textarea
          ref={inputRef}
          className="input assistant-input"
          placeholder="Message the assistant…"
          rows={compact ? 2 : 3}
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button type="button" className="btn btn-primary assistant-send" disabled={loading} onClick={submit}>
          Send
        </button>
      </div>
    </div>
  );
}
