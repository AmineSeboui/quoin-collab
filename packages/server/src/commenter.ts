import { deniedFrame } from './protocol/index.ts';
import { applyClaiming } from './client-ids/claims.ts';
import { freshIdsOf } from './client-ids/ownership.ts';
import { presenceIn } from './client-ids/presence.ts';
import { judgeCommentUpdate } from './comments/judge.ts';
import type { Meter } from './meter.ts';
import { REFUSED_CODE, REFUSED_REASON } from './refusal.ts';
import type { Room } from './room.ts';
import type { SocketSink } from './transport.ts';

/** Where a commenter's update came from: the sync step 2 of a reconnect, or a change made while connected. */
export type UpdateOrigin = 'handshake' | 'live';

export type Commenter = {
  /** False once a refusal has closed the connection. */
  receive(update: Uint8Array, origin: UpdateOrigin): boolean;
  leave(): void;
};

type CommenterOptions = { room: Room; sink: SocketSink; subject: string; meter: Meter };

/**
 * Takes the updates of a connection that may only comment. One written under the commenter's own client ids that the
 * rule allows is applied as a writer's would be; any other never reaches the room. A refused handshake is dropped and
 * the connection kept, since it carries changes their own authors still hold; a refused live change closes it, so
 * the commenter learns it was not saved.
 */
export function commenter({ room, sink, subject, meter }: CommenterOptions): Commenter {
  const presence = presenceIn(room);
  presence.join(sink, subject);
  const allowed = (update: Uint8Array) => {
    const fresh = freshIdsOf(room, update, subject, presence);
    return fresh !== null && judgeCommentUpdate(room.doc, update, subject).ok ? fresh : null;
  };

  return {
    receive(update, origin) {
      const fresh = allowed(update);
      if (fresh !== null) {
        applyClaiming(room, update, fresh, subject, sink);
        meter.record({ kind: 'update.applied', room: room.name, bytes: update.length, origin: 'client' });
        return true;
      }
      meter.record({ kind: 'update.refused', room: room.name, origin });
      if (origin === 'handshake') return true;
      sink.send(deniedFrame(REFUSED_REASON));
      sink.close(REFUSED_CODE, REFUSED_REASON);
      return false;
    },
    leave: () => presence.leave(sink),
  };
}
