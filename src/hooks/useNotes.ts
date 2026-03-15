import { useState, useCallback, useEffect } from 'react';
import { v4 as uuid } from 'uuid';
import type { Note } from '../types';
import { storage } from '../storage';
import { nextCanvasPosition } from '../utils';

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>(() => storage.getNotes());

  useEffect(() => {
    storage.saveNotes(notes);
  }, [notes]);

  const addNote = useCallback(
    (data: Omit<Note, 'id' | 'type' | 'completed' | 'createdAt'>) => {
      setNotes((prev) => {
        const position = data.position ?? nextCanvasPosition(prev.filter((n) => !n.completed && !n.parentId).length);
        return [
          ...prev,
          {
            ...data,
            position,
            id: uuid(),
            type: 'note' as const,
            completed: false,
            createdAt: new Date().toISOString(),
          },
        ];
      });
    },
    [],
  );

  const updateNote = useCallback((id: string, patch: Partial<Note>) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }, []);

  /** Recursively deletes a note and all its descendants */
  const deleteNote = useCallback((id: string) => {
    setNotes((prev) => {
      const toDelete = new Set<string>();
      const collect = (targetId: string) => {
        toDelete.add(targetId);
        prev.filter((n) => n.parentId === targetId).forEach((child) => collect(child.id));
      };
      collect(id);
      return prev.filter((n) => !toDelete.has(n.id));
    });
  }, []);

  const completeNote = useCallback((id: string) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, completed: true } : n)));
  }, []);

  const recoverNote = useCallback((id: string) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, completed: false } : n)));
  }, []);

  return { notes, addNote, updateNote, deleteNote, completeNote, recoverNote, setNotes };
}
