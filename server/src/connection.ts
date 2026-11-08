import * as decoding from 'lib0/decoding';
import { messageYjsSyncStep1 } from 'y-protocols/sync';
import {
  MESSAGE_AWARENESS,
  MESSAGE_QUERY_AWARENESS,
  MESSAGE_SYNC,
  readFrame,
  syncStep1,
  syncStep2,
} from 'quoin-collab-protocol';
import type { Meter } from './meter.ts';
import type { Room } from './room.ts';
import type { ConnectionHandle, SocketSink } from './transport.ts';

export type ConnectionOptions = {
  room: Room;
  sink: SocketSink;
  readOnly: boolean;
  /** The opaque id the host's token named, passed to the meter and nowhere else. */
  subject?: string;
  meter: Meter;
  onError: (error: Error) => void;
};

type AwarenessChange = { added: number[]; updated: number[]; removed: number[] };

/**
 * Serves one socket. It is attached before the opening sync is sent, so a change made in between reaches it as
 * an update rather than being missed; Yjs holds an update it cannot place yet until the sync fills the gap.
 */
export function openConnection({ room, sink, readOnly, subject, meter, onError }: ConnectionOptions): ConnectionHandle {
  const clients = new Set<number>();

  const track = ({ added, updated, removed }: AwarenessChange, origin: unknown) => {
    if (origin !== sink) return;
    for (const id of [...added, ...updated]) clients.add(id);
    for (const id of removed) clients.delete(id);
  };
  room.awareness.on('update', track);
  room.attach(sink);
  meter.record({ kind: 'connection.opened', room: room.name, subject });

  sink.send(syncStep1(room.doc));
  const present = room.awarenessSnapshot();
  if (present !== null) sink.send(present);

  const sync = (decoder: decoding.Decoder) => {
    if (decoding.readVarUint(decoder) === messageYjsSyncStep1) {
      sink.send(syncStep2(room.doc, decoding.readVarUint8Array(decoder)));
      return;
    }
    // Step 2 and a plain update both carry an update, and a read-only client gets to write neither.
    const update = decoding.readVarUint8Array(decoder);
    if (readOnly) return;
    room.applyUpdate(update, sink);
    meter.record({ kind: 'update.applied', room: room.name, bytes: update.length, origin: 'client' });
  };

  return {
    receive(data) {
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
      meter.record({ kind: 'connection.closed', room: room.name });
    },
  };
}
