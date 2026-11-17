import * as decoding from 'lib0/decoding';
import { messageYjsSyncStep1, messageYjsSyncStep2 } from 'y-protocols/sync';
import {
  clientIdFrame,
  MESSAGE_AWARENESS,
  MESSAGE_QUERY_AWARENESS,
  MESSAGE_SYNC,
  readFrame,
  syncStep1,
  syncStep2,
} from './protocol/index.ts';
import type { Access } from './access.ts';
import { commenter } from './commenter.ts';
import type { Meter } from './meter.ts';
import type { Room } from './room.ts';
import type { ConnectionHandle, SocketSink } from './transport.ts';

export type ConnectionOptions = {
  room: Room;
  sink: SocketSink;
  access: Access;
  /** The opaque id the host's token named: counted by the meter, and the author a comment-only connection writes as. */
  subject?: string;
  commentField?: string;
  maxCommentUpdateBytes: number;
  commentClockSkewMs?: number;
  meter: Meter;
  onError: (error: Error) => void;
};

type AwarenessChange = { added: number[]; updated: number[]; removed: number[] };

/**
 * Serves one socket. It is attached before the opening sync is sent, so a change made in between reaches it as
 * an update rather than being missed; Yjs holds an update it cannot place yet until the sync fills the gap.
 */
export function openConnection({
  room,
  sink,
  access,
  subject,
  commentField,
  maxCommentUpdateBytes,
  commentClockSkewMs,
  meter,
  onError,
}: ConnectionOptions): ConnectionHandle {
  const clients = new Set<number>();
  // A commenter writes as its subject, so a grant that names nobody could own no comment: it is served as a reader.
  const comments =
    access === 'comment' && subject
      ? commenter({ room, sink, subject, field: commentField, maxUpdateBytes: maxCommentUpdateBytes,
        clockSkewMs: commentClockSkewMs,
        meter })
      : null;
  let refused = false;

  const track = ({ added, updated, removed }: AwarenessChange, origin: unknown) => {
    if (origin !== sink) return;
    for (const id of [...added, ...updated]) clients.add(id);
    for (const id of removed) clients.delete(id);
  };
  room.awareness.on('update', track);
  room.attach(sink);
  meter.record({ kind: 'connection.opened', room: room.name, subject });

  if (comments !== null) sink.send(clientIdFrame(comments.clientID));
  sink.send(syncStep1(room.doc));
  const present = room.awarenessSnapshot();
  if (present !== null) sink.send(present);

  const sync = (decoder: decoding.Decoder) => {
    const step = decoding.readVarUint(decoder);
    if (step === messageYjsSyncStep1) {
      sink.send(syncStep2(room.doc, decoding.readVarUint8Array(decoder)));
      return;
    }
    // Step 2 and a plain update both carry an update.
    const update = decoding.readVarUint8Array(decoder);
    if (comments !== null) {
      refused = !comments.receive(update, step === messageYjsSyncStep2 ? 'handshake' : 'live');
      return;
    }
    if (access !== 'write') return;
    room.applyUpdate(update, sink);
    meter.record({ kind: 'update.applied', room: room.name, bytes: update.length, origin: 'client' });
  };

  return {
    receive(data) {
      if (refused) return;
      try {
        const { type, decoder } = readFrame(data);
        if (type === MESSAGE_SYNC) sync(decoder);
        else if (type === MESSAGE_AWARENESS) room.applyAwareness(decoding.readVarUint8Array(decoder), sink);
        else if (type === MESSAGE_QUERY_AWARENESS) {
          const snapshot = room.awarenessSnapshot();
          if (snapshot !== null) sink.send(snapshot);
        }
      } catch (error: unknown) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    },
    disconnect() {
      room.awareness.off('update', track);
      room.detach(sink, [...clients]);
      comments?.leave();
      meter.record({ kind: 'connection.closed', room: room.name });
    },
  };
}
