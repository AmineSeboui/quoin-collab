import { uint32 } from 'lib0/random';
import * as Y from 'yjs';
import type { Room } from '../room.ts';

export type Assignment = { readonly clientID: number; release(): void };

const assigned = new WeakMap<Room, Set<number>>();

/**
 * The one Yjs client id a comment-only connection may write under, chosen by the server so that nobody else can be
 * using it: no struct in the room is under it, the room's awareness has never seen it, here or from another process,
 * and no other live connection to the room holds it.
 */
export function assignClientId(room: Room, random: () => number = uint32): Assignment {
  const taken = assigned.get(room) ?? new Set<number>();
  assigned.set(room, taken);
  const used = (id: number) => Y.getState(room.doc.store, id) > 0 || room.awareness.meta.has(id) || taken.has(id);
  let clientID = random();
  while (used(clientID)) clientID = random();
  taken.add(clientID);
  return { clientID, release: () => void taken.delete(clientID) };
}
