import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '../api/client';
import type { AssistantWorkContext } from '../types';

export type AssistantChatMessage = { role: 'user' | 'assistant'; content: string };

export type AssistantPendingItem = {
  id: string;
  tool: string;
  arguments: Record<string, unknown>;
  summary: string;
};

export function useAssistantChat(options: {
  mutationsEnabled: boolean;
  onWorkContext?: (ctx: AssistantWorkContext | null) => void;
  onDataChanged?: () => void;
}) {
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [pendingConfirmations, setPendingConfirmations] = useState<AssistantPendingItem[]>([]);
  const [pendingMutations, setPendingMutations] = useState<AssistantPendingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onWorkContextRef = useRef(options.onWorkContext);
  const onDataChangedRef = useRef(options.onDataChanged);
  const mutationsRef = useRef(options.mutationsEnabled);

  useEffect(() => {
    onWorkContextRef.current = options.onWorkContext;
    onDataChangedRef.current = options.onDataChanged;
    mutationsRef.current = options.mutationsEnabled;
  }, [options.onWorkContext, options.onDataChanged, options.mutationsEnabled]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setError(null);
    setMessages((prev) => {
      const next = [...prev, { role: 'user' as const, content: trimmed }];
      void (async () => {
        setLoading(true);
        try {
          const res = await api.aiChat({
            messages: next,
            clientIsoTime: new Date().toISOString(),
            tzOffsetMinutes: new Date().getTimezoneOffset(),
          });
          setMessages((p) => [...p, { role: 'assistant', content: res.message || '' }]);
          setPendingConfirmations(res.pendingConfirmations ?? []);
          setPendingMutations(res.pendingMutations ?? []);
          if (res.dirtyNotes || res.dirtyTasks || res.dirtyTemplates) {
            onDataChangedRef.current?.();
          }
          onWorkContextRef.current?.(res.workContext);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Request failed');
        } finally {
          setLoading(false);
        }
      })();
      return next;
    });
  }, []);

  const executeItems = useCallback(async (items: AssistantPendingItem[]) => {
    if (items.length === 0) return;
    if (!mutationsRef.current) {
      setError('Turn on “Allow AI to edit data” in Settings to apply changes.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api.aiExecuteActions(items.map(({ tool, arguments: a }) => ({ tool, arguments: a })));
      const ids = new Set(items.map((i) => i.id));
      setPendingConfirmations((pc) => pc.filter((p) => !ids.has(p.id)));
      setPendingMutations((pm) => pm.filter((p) => !ids.has(p.id)));
      onDataChangedRef.current?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not apply changes');
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    messages,
    pendingConfirmations,
    pendingMutations,
    loading,
    error,
    send,
    executeItems,
    setError,
  };
}
