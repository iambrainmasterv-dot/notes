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
  // #region agent log
  fetch('http://127.0.0.1:7906/ingest/ba2f83d7-6b60-4b49-929c-a8d1f05581d3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ed1d1'},body:JSON.stringify({sessionId:'2ed1d1',runId:'signup-502-debug',hypothesisId:'H1',location:'src/api/client.ts:request-before-fetch',message:'API request started',data:{url,method:opts.method ?? 'GET',hasToken:Boolean(token)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  let res: Response;
  try {
    res = await fetch(url, { ...opts, headers });
  } catch (err) {
    // #region agent log
    fetch('http://127.0.0.1:7906/ingest/ba2f83d7-6b60-4b49-929c-a8d1f05581d3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ed1d1'},body:JSON.stringify({sessionId:'2ed1d1',runId:'signup-502-debug',hypothesisId:'H1',location:'src/api/client.ts:request-fetch-throw',message:'API request threw before response',data:{url,error:err instanceof Error ? err.message : String(err)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    throw err;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // #region agent log
    fetch('http://127.0.0.1:7906/ingest/ba2f83d7-6b60-4b49-929c-a8d1f05581d3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ed1d1'},body:JSON.stringify({sessionId:'2ed1d1',runId:'signup-502-debug',hypothesisId:'H2',location:'src/api/client.ts:request-non-ok',message:'API response not ok',data:{url,status:res.status,statusText:res.statusText,body},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  }
  // #region agent log
  fetch('http://127.0.0.1:7906/ingest/ba2f83d7-6b60-4b49-929c-a8d1f05581d3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ed1d1'},body:JSON.stringify({sessionId:'2ed1d1',runId:'signup-502-debug',hypothesisId:'H4',location:'src/api/client.ts:request-success',message:'API response ok',data:{url,status:res.status},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
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

  // Daily Templates
  getTemplates: () => request<Record<string, unknown>[]>('/templates'),
  createTemplate: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/templates', { method: 'POST', body: JSON.stringify(data) }),
  updateTemplate: (id: string, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/templates/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTemplate: (id: string) =>
    request<{ ok: boolean }>(`/templates/${id}`, { method: 'DELETE' }),

  // Daily Instances
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

  // Import
  importData: (data: Record<string, unknown>) =>
    request<{ ok: boolean }>('/import', { method: 'POST', body: JSON.stringify(data) }),
};
