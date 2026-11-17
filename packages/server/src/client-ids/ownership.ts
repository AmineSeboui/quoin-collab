import * as Y from 'yjs';
import type { Room } from '../room.ts';
import { claimantOf } from './claims.ts';
import type { Presence } from './presence.ts';

/** The client ids an update writes structs under beyond what the room holds, or null when it cannot be read. */
function writersOf(doc: Y.Doc, update: Uint8Array): number[] | null {
  try {
    const { to } = Y.parseUpdateMeta(update);
    return [...to].filter(([id, clock]) => clock > Y.getState(doc.store, id)).map(([id]) => id);
  } catch {
    return null;
  }
}

/**
 * The client ids a commenter's update would claim, or null when it writes under one that belongs to someone else.
 * Writing at another's next clock would have the room skip that owner's own change there as already known, so an id
 * is the subject's only when claimed for it, or when nobody has written under it or announced it but the subject.
 */
export function freshIdsOf(room: Room, update: Uint8Array, subject: string, presence: Presence): number[] | null {
  const writers = writersOf(room.doc, update);
  if (writers === null) return null;
  const fresh: number[] = [];
  for (const id of writers) {
    if (claimantOf(room.doc, id) === subject) continue;
    if (Y.getState(room.doc.store, id) > 0 || presence.announcedByOther(id, subject)) return null;
    fresh.push(id);
  }
  return fresh;
}
