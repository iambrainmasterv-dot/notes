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
  ollamaAvailable: boolean | null;
  ollamaCheckPending: boolean;
  ollamaSuggestedModel: string;
  ollamaUsingLocalFallback: boolean;
  onRecheckOllama: () => void | Promise<void>;
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
  ollamaAvailable,
  ollamaCheckPending,
  ollamaSuggestedModel,
  ollamaUsingLocalFallback,
  onRecheckOllama,
  compact,
}: AssistantPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const ollamaReady = ollamaAvailable === true;
  const showSetupGuide = ollamaAvailable === false;
  const showInitialCheck = ollamaAvailable === null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingConfirmations, pendingMutations, loading, ollamaAvailable]);

  const submit = () => {
    if (!ollamaReady) return;
    const el = inputRef.current;
    if (!el) return;
    const v = el.value.trim();
    if (!v || loading) return;
    el.value = '';
    onSend(v);
  };

  return (
    <div className={`assistant-panel ${compact ? 'assistant-panel--compact' : ''}`}>
      {!mutationsEnabled && ollamaReady && (
        <p className="assistant-banner">
          Jarvis cannot change your notes or tasks while <strong>Allow edits</strong> is off in Settings (Jarvis section).
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

      {showInitialCheck && (
        <p className="assistant-setup" role="status">
          Checking connection to Ollama…
        </p>
      )}

      {showSetupGuide && (
        <div className="assistant-setup">
          <h3 className="assistant-setup-title">Set up Jarvis (local Ollama)</h3>
          <p style={{ margin: '0 0 8px' }}>
            Jarvis needs{' '}
            <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer">
              Ollama
            </a>{' '}
            running on a machine your <strong>NoteTasks API</strong> can reach (usually this PC when you use{' '}
            <code>npm run dev:local</code>).
          </p>
          <ol>
            <li>Install Ollama from the link above and start it.</li>
            <li>
              In a terminal, run: <code>ollama pull {ollamaSuggestedModel}</code>
            </li>
            <li>
              If the API runs <strong>on this computer</strong>, add to <code>server/.env</code>:{' '}
              <code>OLLAMA_BASE_URL=http://127.0.0.1:11434</code> or{' '}
              <code>OLLAMA_ALLOW_LOCAL_FALLBACK=true</code>, then restart the API.
            </li>
            {ollamaUsingLocalFallback && (
              <li>
                This server is using <code>OLLAMA_ALLOW_LOCAL_FALLBACK</code> (Ollama on the same host as the API). If the
                probe still fails, confirm Ollama is running and the model is pulled.
              </li>
            )}
            <li>
              If the API runs <strong>in the cloud</strong> (e.g. Railway), it cannot reach Ollama on your PC unless you
              expose it with a tunnel or run the API locally.
            </li>
          </ol>
          <div className="assistant-setup-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={ollamaCheckPending}
              onClick={() => void onRecheckOllama()}
            >
              {ollamaCheckPending ? 'Checking…' : 'Check again'}
            </button>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Optional: set Ollama base URL under Settings → Jarvis.
            </span>
          </div>
        </div>
      )}

      {(pendingMutations.length > 0 || pendingConfirmations.length > 0) && ollamaReady && (
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

      {ollamaReady && (
        <>
          <div className="assistant-messages">
            {messages.length === 0 && !loading && (
              <p className="assistant-empty">
                Ask Jarvis about your notes and tasks, or say e.g. “create a note …” / “write a task …”. If something
                needs a tap, you’ll see <strong>Confirm changes</strong> above the chat. Deletes always need confirmation
                here.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`assistant-bubble assistant-bubble--${m.role}`}>
                <div className="assistant-bubble-label">{m.role === 'user' ? 'You' : 'Jarvis'}</div>
                <div className="assistant-bubble-text">{m.content}</div>
              </div>
            ))}
            {loading && (
              <div className="assistant-bubble assistant-bubble--assistant">
                <div className="assistant-bubble-label">Jarvis</div>
                <div className="assistant-bubble-text assistant-typing">Thinking…</div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="assistant-input-row">
            <textarea
              ref={inputRef}
              className="input assistant-input"
              placeholder="Message Jarvis…"
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
        </>
      )}
    </div>
  );
}
