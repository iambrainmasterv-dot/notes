function effectiveNoteParentType(n) {
  if (!n.parent_id) return undefined;
  return n.parent_type || 'note';
}

function effectiveTaskParentType(t) {
  if (!t.parent_id) return undefined;
  return t.parent_type || 'note';
}

function childrenOf(parent, notes, tasks) {
  const childNotes = notes.filter((n) => {
    if (n.parent_id !== parent.id) return false;
    return effectiveNoteParentType(n) === parent.type;
  });
  const childTasks = tasks.filter((t) => {
    if (t.parent_id !== parent.id) return false;
    return effectiveTaskParentType(t) === parent.type;
  });
  return { childNotes, childTasks };
}

export function collectDescendantIds(rootType, rootId, notes, tasks) {
  const seenN = new Set();
  const seenT = new Set();
  const stack = [{ type: rootType, id: rootId }];
  while (stack.length) {
    const ref = stack.pop();
    const { childNotes, childTasks } = childrenOf(ref, notes, tasks);
    for (const n of childNotes) {
      if (seenN.has(n.id)) continue;
      seenN.add(n.id);
      stack.push({ type: 'note', id: n.id });
    }
    for (const t of childTasks) {
      if (seenT.has(t.id)) continue;
      seenT.add(t.id);
      stack.push({ type: 'task', id: t.id });
    }
  }
  return { noteIds: [...seenN], taskIds: [...seenT] };
}
