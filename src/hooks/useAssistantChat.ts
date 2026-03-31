import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '../api/client';
import { playAppSound } from '../audio/appSounds';
import type { AssistantWorkContext } from '../types';

export type PendingMutation = {
  id: string;
  tool: string;
  arguments: Record<string, unknown>;
  summary: string;
};

export type AssistantChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  pendingMutations?: PendingMutation[];
  proposalOpen?: boolean;
  contextUserMessageForActions?: string;
};

function toApiMessages(msgs: AssistantChatMessage[]): { role: 'user' | 'assistant'; content: string }[] {
  return msgs.map(({ role, content }) => ({ role, content }));
}

function findAnchorUserMessage(msgs: AssistantChatMessage[], assistantIndex: number): string {
  for (let i = assistantIndex - 1; i >= 0; i--) {
    if (msgs[i]?.role === 'user') return msgs[i].content;
  }
  return '';
}

function clearOpenProposals(msgs: AssistantChatMessage[]): AssistantChatMessage[] {
  return msgs.map((m) => {
    if (m.role !== 'assistant' || !m.pendingMutations?.length) return m;
    return {
      ...m,
      pendingMutations: undefined,
      proposalOpen: false,
      contextUserMessageForActions: undefined,
    };
  });
}

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
    playAppSound('createAction');
    sendInFlightRef.current = true;
    setError(null);
    const cleared = clearOpenProposals(messagesRef.current);
    const userMsg: AssistantChatMessage = { role: 'user', content: trimmed };
    const nextMessages = [...cleared, userMsg];
    setMessages(nextMessages);
    setLoading(true);
    try {
      const res = await api.aiChat({
        messages: toApiMessages(nextMessages),
        clientIsoTime: new Date().toISOString(),
        tzOffsetMinutes: new Date().getTimezoneOffset(),
      });
      const pending = res.pendingMutations?.length ? res.pendingMutations : undefined;
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res.message || '',
          pendingMutations: pending,
          proposalOpen: Boolean(pending?.length),
          contextUserMessageForActions: pending?.length ? trimmed : undefined,
        },
      ]);
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

  const acceptProposal = useCallback(async (messageIndex: number) => {
    const msgs = messagesRef.current;
    const target = msgs[messageIndex];
    if (!target?.pendingMutations?.length || sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    setError(null);
    setLoading(true);
    try {
      const res = await api.aiExecuteActions(
        target.pendingMutations.map((p) => ({ tool: p.tool, arguments: p.arguments })),
        { contextUserMessage: target.contextUserMessageForActions || '' },
      );
      const allOk = res.results.length > 0 && res.results.every((r) => r.ok);
      const summaryLine = allOk
        ? 'Applied — your app is updated.'
        : `Some actions failed: ${res.results
            .filter((r) => !r.ok)
            .map((r) => r.error || r.tool)
            .join('; ') || 'unknown error'}`;
      setMessages((prev) =>
        prev.map((m, i) =>
          i === messageIndex && m.role === 'assistant'
            ? {
                ...m,
                content: `${m.content}\n\n${summaryLine}`,
                pendingMutations: undefined,
                proposalOpen: false,
                contextUserMessageForActions: undefined,
              }
            : m,
        ),
      );
      if (res.results.some((r) => r.ok)) {
        onDataChangedRef.current?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
      sendInFlightRef.current = false;
    }
  }, []);

  const denyProposal = useCallback(async (messageIndex: number) => {
    const msgs = messagesRef.current;
    const target = msgs[messageIndex];
    if (!target?.pendingMutations?.length || sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    setError(null);
    setLoading(true);
    try {
      const cleared = msgs.map((m, i) =>
        i === messageIndex && m.role === 'assistant'
          ? {
              ...m,
              pendingMutations: undefined,
              proposalOpen: false,
              contextUserMessageForActions: undefined,
            }
          : m,
      );
      setMessages(cleared);
      const res = await api.aiChat({
        messages: toApiMessages(cleared),
        clientIsoTime: new Date().toISOString(),
        tzOffsetMinutes: new Date().getTimezoneOffset(),
        followUp: { mode: 'deny', previousPending: target.pendingMutations },
      });
      const pending = res.pendingMutations?.length ? res.pendingMutations : undefined;
      setMessages((prev) => {
        const anchor = findAnchorUserMessage(prev, prev.length);
        return [
          ...prev,
          {
            role: 'assistant',
            content: res.message || '',
            pendingMutations: pending,
            proposalOpen: Boolean(pending?.length),
            contextUserMessageForActions: pending?.length ? anchor : undefined,
          },
        ];
      });
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

  const redoProposal = useCallback(async (messageIndex: number) => {
    const msgs = messagesRef.current;
    const target = msgs[messageIndex];
    if (!target?.pendingMutations?.length || sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    setError(null);
    setLoading(true);
    try {
      const cleared = msgs.map((m, i) =>
        i === messageIndex && m.role === 'assistant'
          ? {
              ...m,
              pendingMutations: undefined,
              proposalOpen: false,
              contextUserMessageForActions: undefined,
            }
          : m,
      );
      setMessages(cleared);
      const res = await api.aiChat({
        messages: toApiMessages(cleared),
        clientIsoTime: new Date().toISOString(),
        tzOffsetMinutes: new Date().getTimezoneOffset(),
        followUp: { mode: 'redo', previousPending: target.pendingMutations },
      });
      const pending = res.pendingMutations?.length ? res.pendingMutations : undefined;
      setMessages((prev) => {
        const anchor = findAnchorUserMessage(prev, prev.length);
        return [
          ...prev,
          {
            role: 'assistant',
            content: res.message || '',
            pendingMutations: pending,
            proposalOpen: Boolean(pending?.length),
            contextUserMessageForActions: pending?.length ? anchor : undefined,
          },
        ];
      });
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
    acceptProposal,
    denyProposal,
    redoProposal,
    setError,
  };
}
