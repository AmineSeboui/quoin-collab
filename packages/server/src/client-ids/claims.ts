import * as Y from 'yjs';
import type { Room } from '../room.ts';
import type { SocketSink } from '../transport.ts';

/**
 * The subject whose comment-only connection first wrote under each Yjs client id, written by the server alone. It
 * lives in the document rather than in memory because deleted comments lose their content, author included, and
 * because only the document reaches storage and every other process serving the room.
 */
export const COMMENTERS = 'quoin-collab-commenters';

const claimsOf = (doc: Y.Doc) => doc.getMap<unknown>(COMMENTERS);

/** Who claimed `id`, or undefined when no commenter has written under it. */
export const claimantOf = (doc: Y.Doc, id: number): unknown => claimsOf(doc).get(String(id));

/** Applies a commenter's update, claiming for `subject` the client ids it writes under for the first time. */
export function applyClaiming(
  room: Room,
  update: Uint8Array,
  fresh: readonly number[],
  subject: string,
  sink: SocketSink,
): void {
  if (fresh.length === 0) {
    room.applyUpdate(update, sink);
    return;
  }
  // One change, so a claim never reaches storage or another process without the structs it covers. Its origin keeps
  // the claim from the commenter, whose sync step 2 then carries only its own structs if a room ever loses both.
  Y.transact(
    room.doc,
    (transaction) => {
      room.applyUpdate(update, sink);
      // Applying an update marks the change remote, and Yjs would take the claims below, written under the room's
      // own client id, for another client using that id, and give the room a new one after every claim.
      transaction.local = true;
      const claims = claimsOf(room.doc);
      for (const id of fresh) claims.set(String(id), subject);
    },
    sink,
  );
}
