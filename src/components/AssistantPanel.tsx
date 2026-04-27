import { useRef, useEffect } from 'react';
import type { AssistantChatMessage } from '../hooks/useAssistantChat';
import type { JarvisMode } from '../jarvis/jarvisModeStorage';

export interface AssistantPanelProps {
  jarvisMode: JarvisMode;
  onJarvisModeChange: (mode: JarvisMode) => void;
  messages: AssistantChatMessage[];
  loading: boolean;
  error: string | null;
  onSend: (text: string) => void;
  onAcceptProposal: (messageIndex: number) => void | Promise<void>;
  onDenyProposal: (messageIndex: number) => void | Promise<void>;
  onRedoProposal: (messageIndex: number) => void | Promise<void>;
  onDismissError: () => void;
  ollamaAvailable: boolean | null;
  ollamaCheckPending: boolean;
  ollamaSuggestedModel: string;
  ollamaCloudLoopbackHint?: string;
  onRecheckOllama: () => void | Promise<void>;
  /** Narrow dock layout */
  compact?: boolean;
  /** Local guest session — hide Ollama setup and explain Jarvis is unavailable */
  guestMode?: boolean;
}

export function AssistantPanel({
  jarvisMode,
  onJarvisModeChange,
  messages,
  loading,
  error,
  onSend,
  onAcceptProposal,
  onDenyProposal,
  onRedoProposal,
  onDismissError,
  ollamaAvailable,
  ollamaCheckPending,
  ollamaSuggestedModel,
  ollamaCloudLoopbackHint,
  onRecheckOllama,
  compact,
  guestMode = false,
}: AssistantPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mutationsEnabled = jarvisMode === 'edit';

  const ollamaReady = !guestMode && ollamaAvailable === true;
  const showSetupGuide = !guestMode && ollamaAvailable === false;
  const showInitialCheck = !guestMode && ollamaAvailable === null;

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
      {guestMode && (
        <p className="assistant-banner" role="status">
          Sign in to use Jarvis.
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
          Checking Ollama…
        </p>
      )}

      {showSetupGuide && ollamaCloudLoopbackHint && (
        <p className="assistant-cloud-hint" role="alert">
          {ollamaCloudLoopbackHint}
        </p>
      )}

      {showSetupGuide && (
        <div className="assistant-setup">
          <h3 className="assistant-setup-title">Ollama</h3>
          <p style={{ margin: '0 0 8px' }}>
            <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer">
              Install Ollama
            </a>
            , run <code>ollama pull {ollamaSuggestedModel}</code>, set <code>OLLAMA_BASE_URL</code> in{' '}
            <code>server/.env</code> (e.g. <code>http://127.0.0.1:11434</code>), restart the API.
          </p>
          <div className="assistant-setup-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={ollamaCheckPending}
              onClick={() => void onRecheckOllama()}
            >
              {ollamaCheckPending ? 'Checking…' : 'Check again'}
            </button>
          </div>
        </div>
      )}

      {ollamaReady && (
        <>
          <div className="assistant-mode-row" role="group" aria-label="Jarvis mode">
            <span className="assistant-mode-label">Mode</span>
            <div className="theme-modes assistant-mode-toggle">
              <button
                type="button"
                className={`theme-mode-btn ${jarvisMode === 'chat' ? 'active' : ''}`}
                onClick={() => onJarvisModeChange('chat')}
              >
                <span>💬</span>
                <span>Chat</span>
              </button>
              <button
                type="button"
                className={`theme-mode-btn ${jarvisMode === 'edit' ? 'active' : ''}`}
                onClick={() => onJarvisModeChange('edit')}
              >
                <span>✎</span>
                <span>Edit</span>
              </button>
            </div>
          </div>

          <div className="assistant-messages">
            {messages.length === 0 && !loading && (
              <p className="assistant-empty">
                {jarvisMode === 'chat' ? 'Chat: no app changes.' : 'Edit: changes may need Accept.'}
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`assistant-bubble assistant-bubble--${m.role}`}>
                <div className="assistant-bubble-label">{m.role === 'user' ? 'You' : 'Jarvis'}</div>
                <div className="assistant-bubble-text">{m.content}</div>
                {m.role === 'assistant' &&
                  m.proposalOpen &&
                  mutationsEnabled &&
                  (m.pendingMutations?.length ?? 0) > 0 && (
                    <div className="assistant-proposal-actions">
                      <span className="assistant-proposal-hint">Confirm?</span>
                      <div className="assistant-proposal-buttons">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={loading}
                          onClick={() => void onAcceptProposal(i)}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          disabled={loading}
                          onClick={() => void onDenyProposal(i)}
                        >
                          Deny
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          disabled={loading}
                          onClick={() => void onRedoProposal(i)}
                        >
                          Redo
                        </button>
                      </div>
                    </div>
                  )}
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
              placeholder="Message…"
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
