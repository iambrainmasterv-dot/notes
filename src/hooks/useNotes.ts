import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuid } from 'uuid';
import type { Note } from '../types';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { storage } from '../storage';
import { nextCanvasPosition } from '../utils';

function toApi(n: Note) {
  return {
    id: n.id,
    title: n.title,
    description: n.description,
    completed: n.completed,
    created_at: n.createdAt,
    deadline: n.deadline ?? null,
    parent_id: n.parentId ?? null,
    position_x: n.position?.x ?? null,
    position_y: n.position?.y ?? null,
    collapsed: n.collapsed ?? false,
    daily: n.daily ?? false,
    source_schedule_template_id: n.sourceScheduleTemplateId ?? null,
    source_occurrence_date: n.sourceOccurrenceDate ?? null,
  };
}

function fromApi(row: Record<string, unknown>): Note {
  return {
    id: row.id as string,
    type: 'note',
    title: row.title as string,
    description: row.description as string,
    completed: row.completed as boolean,
    createdAt: row.created_at as string,
    deadline: (row.deadline as string) || undefined,
    parentId: (row.parent_id as string) || undefined,
    position: row.position_x != null ? { x: row.position_x as number, y: row.position_y as number } : undefined,
    collapsed: row.collapsed as boolean,
    daily: row.daily as boolean,
    sourceScheduleTemplateId: (row.source_schedule_template_id as string) || undefined,
    sourceOccurrenceDate: (row.source_occurrence_date as string) || undefined,
  };
}

export function useNotes() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const loaded = useRef(false);

  useEffect(() => {
    if (!user) return;
    api.getNotes()
      .then((rows) => { setNotes(rows.map(fromApi)); loaded.current = true; })
      .catch(() => { setNotes(storage.getNotes()); loaded.current = true; });
  }, [user]);

  useEffect(() => {
    if (!loaded.current) return;
    storage.saveNotes(notes);
  }, [notes]);

  const addNote = useCallback(
    (data: Omit<Note, 'id' | 'type' | 'completed' | 'createdAt'>) => {
      const id = uuid();
      const now = new Date().toISOString();

      setNotes((prev) => {
        const pos = data.position ?? nextCanvasPosition(prev.filter((n) => !n.completed && !n.parentId).length);
        const note: Note = { ...data, id, type: 'note', completed: false, createdAt: now, position: pos };
        api.createNote(toApi(note)).catch(() => {});
        return [...prev, note];
      });
    },
    [],
  );

  const updateNote = useCallback((id: string, patch: Partial<Note>) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));

    const dbPatch: Record<string, unknown> = {};
    if (patch.title !== undefined) dbPatch.title = patch.title;
    if (patch.description !== undefined) dbPatch.description = patch.description;
    if (patch.completed !== undefined) dbPatch.completed = patch.completed;
    if (patch.deadline !== undefined) dbPatch.deadline = patch.deadline ?? null;
    if (patch.parentId !== undefined) dbPatch.parent_id = patch.parentId ?? null;
    if (patch.position !== undefined) { dbPatch.position_x = patch.position?.x ?? null; dbPatch.position_y = patch.position?.y ?? null; }
    if (patch.collapsed !== undefined) dbPatch.collapsed = patch.collapsed;
    if (patch.daily !== undefined) dbPatch.daily = patch.daily;
    if (Object.keys(dbPatch).length) api.updateNote(id, dbPatch).catch(() => {});
  }, []);

  const deleteNote = useCallback((id: string) => {
    setNotes((prev) => {
      const toDelete = new Set<string>();
      const collect = (targetId: string) => {
        toDelete.add(targetId);
        prev.filter((n) => n.parentId === targetId).forEach((child) => collect(child.id));
      };
      collect(id);
      const ids = Array.from(toDelete);
      if (ids.length === 1) api.deleteNote(ids[0]).catch(() => {});
      else api.deleteNotes(ids).catch(() => {});
      return prev.filter((n) => !toDelete.has(n.id));
    });
  }, []);

  const completeNote = useCallback((id: string) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, completed: true } : n)));
    api.updateNote(id, { completed: true }).catch(() => {});
  }, []);

  const recoverNote = useCallback((id: string) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, completed: false } : n)));
    api.updateNote(id, { completed: false }).catch(() => {});
  }, []);

  return { notes, addNote, updateNote, deleteNote, completeNote, recoverNote, setNotes };
}
