import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '../api/client';
import type { AssistantWorkContext } from '../types';

export type AssistantChatMessage = { role: 'user' | 'assistant'; content: string };

export function useAssistantChat(options: {
  mutationsEnabled: boolean;
  onWorkContext?: (ctx: AssistantWorkContext | null) => void;
  onDataChanged?: () => void;
}) {
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onWorkContextRef = useRef(options.onWorkContext);
  const onDataChangedRef = useRef(options.onDataChanged);
  const messagesRef = useRef<AssistantChatMessage[]>([]);
  const sendInFlightRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    onWorkContextRef.current = options.onWorkContext;
    onDataChangedRef.current = options.onDataChanged;
  }, [options.onWorkContext, options.onDataChanged]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    setError(null);
    const userMsg: AssistantChatMessage = { role: 'user', content: trimmed };
    const nextMessages = [...messagesRef.current, userMsg];
    setMessages(nextMessages);
    setLoading(true);
    try {
      const res = await api.aiChat({
        messages: nextMessages,
        clientIsoTime: new Date().toISOString(),
        tzOffsetMinutes: new Date().getTimezoneOffset(),
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: res.message || '' }]);
      if (res.dirtyNotes || res.dirtyTasks || res.dirtyTemplates) {
        onDataChangedRef.current?.();
      }
      onWorkContextRef.current?.(res.workContext);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
      sendInFlightRef.current = false;
    }
  }, []);

  return {
    messages,
    loading,
    error,
    send,
    setError,
  };
}
