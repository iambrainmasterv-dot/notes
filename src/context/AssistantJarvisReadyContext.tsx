import { createContext, useContext } from 'react';

/** True when logged in and GET /api/ai/availability reported Ollama reachable (same gate as Jarvis panel). */
export const AssistantJarvisReadyContext = createContext(false);

export function useAssistantJarvisReady(): boolean {
  return useContext(AssistantJarvisReadyContext);
}
