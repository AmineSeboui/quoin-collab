import { deniedFrame } from './protocol/index.ts';
import { assignClientId } from './client-ids/assign.ts';
import { writtenOnlyUnder } from './client-ids/written-under.ts';
import { clockAt } from './comments/clock.ts';
import { judgeCommentUpdate } from './comments/judge.ts';
import type { Meter } from './meter.ts';
import { REFUSED_CODE, REFUSED_REASON } from './refusal.ts';
import type { Room } from './room.ts';
import type { SocketSink } from './transport.ts';

/** Where a commenter's update came from: the sync step 2 of a reconnect, or a change made while connected. */
export type UpdateOrigin = 'handshake' | 'live';

export type Commenter = {
  /** The client id this connection may write under, which the client is told before anything else. */
  readonly clientID: number;
  /** False once a refusal has closed the connection. */
  receive(update: Uint8Array, origin: UpdateOrigin): boolean;
  leave(): void;
};

type CommenterOptions = {
  room: Room;
  sink: SocketSink;
  subject: string;
  field?: string;
  maxUpdateBytes: number;
  clockSkewMs?: number;
  meter: Meter;
};

/**
 * Takes the updates of a connection that may only comment. One no larger than `maxUpdateBytes`, written only under the
 * client id the server assigned it, that the rule allows, is applied as a writer's would be; any other never reaches
 * the room. A refused handshake is dropped and the connection kept, since it carries changes their own authors still
 * hold; a refused live change closes it, so the commenter learns it was not saved.
 */
export function commenter({ room, sink, subject, field, maxUpdateBytes, clockSkewMs, meter }: CommenterOptions): Commenter {
  const assignment = assignClientId(room);
  const allowed = (update: Uint8Array) =>
    update.length <= maxUpdateBytes &&
    writtenOnlyUnder(update, assignment.clientID) &&
    judgeCommentUpdate(room.doc, update, subject, field, clockAt(Date.now(), clockSkewMs)).ok;

  return {
    clientID: assignment.clientID,
    receive(update, origin) {
      if (allowed(update)) {
        room.applyUpdate(update, sink);
        meter.record({ kind: 'update.applied', room: room.name, bytes: update.length, origin: 'client' });
        return true;
      }
      meter.record({ kind: 'update.refused', room: room.name, origin });
      if (origin === 'handshake') return true;
      sink.send(deniedFrame(REFUSED_REASON));
      sink.close(REFUSED_CODE, REFUSED_REASON);
      return false;
    },
    leave: () => assignment.release(),
  };
}
