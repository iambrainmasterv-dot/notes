const BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'notesapp_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const url = `${BASE}${path}`;
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  // Auth
  signup: (email: string, password: string) =>
    request<{ token: string; user: { id: string; email: string } }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) =>
    request<{ token: string; user: { id: string; email: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<{ user: { id: string; email: string } }>('/auth/me'),

  forgotPassword: (email: string) =>
    request<{ ok: boolean; message?: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, password: string) =>
    request<{ ok: boolean }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),

  // Notes
  getNotes: () => request<Record<string, unknown>[]>('/notes'),
  createNote: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/notes', { method: 'POST', body: JSON.stringify(data) }),
  updateNote: (id: string, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/notes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteNote: (id: string) =>
    request<{ ok: boolean }>(`/notes/${id}`, { method: 'DELETE' }),
  deleteNotes: (ids: string[]) =>
    request<{ ok: boolean }>('/notes/delete-many', { method: 'POST', body: JSON.stringify({ ids }) }),

  // Tasks
  getTasks: () => request<Record<string, unknown>[]>('/tasks'),
  createTask: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id: string, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTask: (id: string) =>
    request<{ ok: boolean }>(`/tasks/${id}`, { method: 'DELETE' }),

  // Settings
  getSettings: () => request<Record<string, unknown>>('/settings'),
  updateSettings: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/settings', { method: 'PATCH', body: JSON.stringify(data) }),

  // Daily Templates (legacy)
  getTemplates: () => request<Record<string, unknown>[]>('/templates'),
  createTemplate: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/templates', { method: 'POST', body: JSON.stringify(data) }),
  updateTemplate: (id: string, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/templates/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTemplate: (id: string) =>
    request<{ ok: boolean }>(`/templates/${id}`, { method: 'DELETE' }),

  // Daily Instances (legacy)
  getInstances: (day: string) => request<Record<string, unknown>[]>(`/instances?day=${day}`),
  createInstance: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/instances', { method: 'POST', body: JSON.stringify(data) }),
  createInstancesBulk: (items: Record<string, unknown>[]) =>
    request<Record<string, unknown>[]>('/instances/bulk', { method: 'POST', body: JSON.stringify({ items }) }),
  updateInstance: (id: string, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/instances/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteInstance: (id: string) =>
    request<{ ok: boolean }>(`/instances/${id}`, { method: 'DELETE' }),
  deletePresetInstances: (day: string) =>
    request<{ ok: boolean }>(`/instances/by-day/preset?day=${day}`, { method: 'DELETE' }),
  getTemplateIds: (day: string) =>
    request<string[]>(`/instances/template-ids?day=${day}`),

  // Presets
  getPresets: () => request<Record<string, unknown>[]>('/presets'),
  createPreset: (data: Record<string, unknown>) =>
    request<{ ok: boolean }>('/presets', { method: 'POST', body: JSON.stringify(data) }),
  updatePreset: (id: string, data: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/presets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePreset: (id: string) =>
    request<{ ok: boolean }>(`/presets/${id}`, { method: 'DELETE' }),

  // Schedule Templates (new)
  getScheduleTemplates: () =>
    request<Record<string, unknown>[]>('/schedule-templates'),
  createScheduleTemplate: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/schedule-templates', { method: 'POST', body: JSON.stringify(data) }),
  updateScheduleTemplate: (id: string, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/schedule-templates/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteScheduleTemplate: (id: string) =>
    request<{ ok: boolean }>(`/schedule-templates/${id}`, { method: 'DELETE' }),
  materializeScheduleTemplate: (templateId: string, occurrenceDate: string) =>
    request<{ materialized: number }>('/schedule-templates/materialize', {
      method: 'POST',
      body: JSON.stringify({ template_id: templateId, occurrence_date: occurrenceDate }),
    }),
  cleanupOccurrence: (occurrenceDate: string) =>
    request<{ ok: boolean }>('/schedule-templates/cleanup', {
      method: 'POST',
      body: JSON.stringify({ occurrence_date: occurrenceDate }),
    }),

  // Import
  importData: (data: Record<string, unknown>) =>
    request<{ ok: boolean }>('/import', { method: 'POST', body: JSON.stringify(data) }),

  // Jarvis (local Ollama)
  getAssistantAvailability: async () => {
    try {
      return await request<{
        available: boolean;
        suggestedModel: string;
        cloudLoopbackHint?: string;
      }>('/ai/availability');
    } catch {
      return { available: false, suggestedModel: 'llama3.2' };
    }
  },

  aiChat: (body: {
    messages: { role: 'user' | 'assistant'; content: string }[];
    clientIsoTime?: string;
    tzOffsetMinutes?: number;
  }) =>
    request<{
      message: string;
      pendingConfirmations: { id: string; tool: string; arguments: Record<string, unknown>; summary: string }[];
      pendingMutations: { id: string; tool: string; arguments: Record<string, unknown>; summary: string }[];
      workContext: 'notes' | 'tasks' | 'schedule' | null;
      dirtyNotes?: boolean;
      dirtyTasks?: boolean;
      dirtyTemplates?: boolean;
    }>('/ai/chat', { method: 'POST', body: JSON.stringify(body) }),

  aiExecuteActions: (actions: { tool: string; arguments: Record<string, unknown> }[]) =>
    request<{ results: { ok: boolean; tool: string; error?: string; item?: unknown; deleted?: unknown }[] }>(
      '/ai/execute-actions',
      { method: 'POST', body: JSON.stringify({ actions }) },
    ),
};
