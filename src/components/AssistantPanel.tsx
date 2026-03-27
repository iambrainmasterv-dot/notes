import { useRef, useEffect } from 'react';
import type { AssistantChatMessage } from '../hooks/useAssistantChat';

export interface AssistantPanelProps {
  mutationsEnabled: boolean;
  messages: AssistantChatMessage[];
  loading: boolean;
  error: string | null;
  onSend: (text: string) => void;
  onDismissError: () => void;
  ollamaAvailable: boolean | null;
  ollamaCheckPending: boolean;
  ollamaSuggestedModel: string;
  ollamaCloudLoopbackHint?: string;
  onRecheckOllama: () => void | Promise<void>;
  /** Narrow dock layout */
  compact?: boolean;
}

export function AssistantPanel({
  mutationsEnabled,
  messages,
  loading,
  error,
  onSend,
  onDismissError,
  ollamaAvailable,
  ollamaCheckPending,
  ollamaSuggestedModel,
  ollamaCloudLoopbackHint,
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
  }, [messages, loading, ollamaAvailable]);

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

      {showSetupGuide && ollamaCloudLoopbackHint && (
        <p className="assistant-cloud-hint" role="alert">
          {ollamaCloudLoopbackHint}
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
              Set <code>OLLAMA_BASE_URL</code> in <code>server/.env</code> (or your host&apos;s env) to the Ollama origin
              the API can reach — e.g. <code>http://127.0.0.1:11434</code> locally, or your <strong>https</strong> ngrok
              origin if the API is hosted. Restart the API after changing it.
            </li>
            <li>
              If the API runs <strong>in the cloud</strong>, it cannot reach Ollama on your PC at 127.0.0.1; use a tunnel
              and put that URL in <code>OLLAMA_BASE_URL</code> on the server.
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
              Server env: <code>OLLAMA_BASE_URL</code>
            </span>
          </div>
        </div>
      )}

      {ollamaReady && (
        <>
          <div className="assistant-messages">
            {messages.length === 0 && !loading && (
              <p className="assistant-empty">
                Ask Jarvis about your notes and tasks, or say e.g. “create a note …” / “write a task …”. Edits apply right
                away when <strong>Allow edits</strong> is on — you can ask Jarvis to <strong>undo</strong> recent changes.
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
