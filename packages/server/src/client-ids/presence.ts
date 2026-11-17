import { outdatedTimeout } from 'y-protocols/awareness';
import { REMOTE, type Room } from '../room.ts';
import type { SocketSink } from '../transport.ts';

type AwarenessChange = { added: number[]; updated: number[]; removed: number[] };

export type Presence = {
  join(sink: SocketSink, subject: string): void;
  leave(sink: SocketSink): void;
  /** Whether a connection other than `subject`'s own holds `id` in this room. */
  announcedByOther(id: number, subject: string): boolean;
};

/**
 * Who holds a client id: a commenter's subject, for the room's life; another connection here, until it takes the id
 * back; another process, or someone already here before the first commenter, for as long as awareness keeps a state.
 */
type Holder =
  | { kind: 'commenter'; subject: string }
  | { kind: 'connection'; origin: unknown }
  | { kind: 'remote' | 'unknown'; seen: number };

const presences = new WeakMap<Room, Presence>();

const live = (held: Holder | undefined): held is Holder =>
  held !== undefined && (!('seen' in held) || Date.now() - held.seen < outdatedTimeout);

const same = (held: Holder, by: Holder): boolean => {
  if (held.kind === 'commenter') return by.kind === 'commenter' && by.subject === held.subject;
  if (held.kind === 'connection') return by.kind === 'connection' && by.origin === held.origin;
  return held.kind === 'remote' && by.kind === 'remote';
};

function watch(room: Room): Presence {
  const commenters = new Map<unknown, string>();
  const holders = new Map<number, Holder>();
  for (const [id, meta] of room.awareness.meta) {
    if (room.awareness.states.has(id)) holders.set(id, { kind: 'unknown', seen: meta.lastUpdated });
  }

  const announcer = (origin: unknown): Holder | null => {
    if (origin === REMOTE) return { kind: 'remote', seen: Date.now() };
    const subject = commenters.get(origin);
    if (subject !== undefined) return { kind: 'commenter', subject };
    return typeof origin === 'object' && origin !== null ? { kind: 'connection', origin } : null;
  };

  // Only the holder takes an id back, or awareness timing it out once nobody renews it; a commenter's never lapses.
  const releasedBy = (held: Holder, origin: unknown): boolean => {
    if (held.kind === 'commenter') return false;
    if (origin === 'timeout') return true;
    if (held.kind === 'connection') return held.origin === origin;
    return held.kind === 'remote' ? origin === REMOTE : !commenters.has(origin);
  };

  room.awareness.on('update', ({ added, updated, removed }: AwarenessChange, origin: unknown) => {
    const by = announcer(origin);
    if (by !== null) {
      for (const id of [...added, ...updated]) {
        const held = holders.get(id);
        // The first to announce an id holds it, so repeating someone's id gains nothing. Who was here before the
        // first commenter is unknown, so the first connection or process to renew it takes it over, never a commenter.
        if (!live(held) || same(held, by) || (held.kind === 'unknown' && by.kind !== 'commenter')) holders.set(id, by);
      }
    }
    for (const id of removed) {
      const held = holders.get(id);
      if (held !== undefined && releasedBy(held, origin)) holders.delete(id);
    }
  });

  return {
    join: (sink, subject) => void commenters.set(sink, subject),
    leave: (sink) => void commenters.delete(sink),
    announcedByOther(id, subject) {
      const held = holders.get(id);
      return live(held) && !(held.kind === 'commenter' && held.subject === subject);
    },
  };
}

/** Who holds which client id in `room`, watched from the first comment-only connection on. */
export function presenceIn(room: Room): Presence {
  const known = presences.get(room);
  if (known !== undefined) return known;
  const presence = watch(room);
  presences.set(room, presence);
  return presence;
}
