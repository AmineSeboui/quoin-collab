import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import {
  MESSAGE_AUTH,
  MESSAGE_AWARENESS,
  MESSAGE_SYNC,
  readDenial,
  readFrame,
  syncStep1,
} from '../src/protocol/index.ts';
import type { CollabServer } from '../src/server.ts';

const FROM_SERVER = Symbol('from the server');

export type Peer = {
  readonly doc: Y.Doc;
  /** What the server did to this socket, in order: `denied:<reason>` and `closed:<code>:<reason>`. */
  readonly events: string[];
  /** Makes a change in the peer's own copy and returns the update, without sending it. */
  change(make: (doc: Y.Doc) => void): Uint8Array;
  /** Sends an update as a live change, or as the sync step 2 a client sends while reconnecting. */
  send(update: Uint8Array, as?: 'live' | 'handshake'): void;
  /** Tells the room this socket is here, under its own client id unless another is given. */
  announce(clientID?: number): void;
  leave(): void;
};

const syncFrame = (step: number, update: Uint8Array): Uint8Array => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  encoding.writeVarUint(encoder, step);
  encoding.writeVarUint8Array(encoder, update);
  return encoding.toUint8Array(encoder);
};

const awarenessFrame = (clientID: number, clock: number): Uint8Array => {
  const update = encoding.createEncoder();
  encoding.writeVarUint(update, 1);
  encoding.writeVarUint(update, clientID);
  encoding.writeVarUint(update, clock);
  encoding.writeVarString(update, JSON.stringify({ user: { name: 'someone' } }));
  const frame = encoding.createEncoder();
  encoding.writeVarUint(frame, MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(frame, encoding.toUint8Array(update));
  return encoding.toUint8Array(frame);
};

/**
 * A socket driven by hand, for sending what no honest client would. Its copy of the room is kept in step with what
 * the server sends, so a change made on it lands where the room expects it.
 */
export async function peer(collab: CollabServer, room: string, token: string | null = null): Promise<Peer> {
  const doc = new Y.Doc();
  const events: string[] = [];
  let clock = 0;
  const handle = await collab.connect(
    { room, token, headers: {} },
    {
      send: (data) => {
        const { type, decoder } = readFrame(data);
        if (type === MESSAGE_SYNC) syncProtocol.readSyncMessage(decoder, encoding.createEncoder(), doc, FROM_SERVER);
        else if (type === MESSAGE_AUTH) events.push(`denied:${readDenial(decoder)}`);
      },
      close: (code, reason) => events.push(`closed:${code}:${reason}`),
    },
  );
  if (handle === null) throw new Error(`${room} turned the peer away`);
  handle.receive(syncStep1(doc));

  return {
    doc,
    events,
    change(make) {
      const made: Uint8Array[] = [];
      const keep = (update: Uint8Array, origin: unknown) => {
        if (origin !== FROM_SERVER) made.push(update);
      };
      doc.on('update', keep);
      doc.transact(() => make(doc));
      doc.off('update', keep);
      return Y.mergeUpdates(made);
    },
    send: (update, as = 'live') => {
      const step = as === 'live' ? syncProtocol.messageYjsUpdate : syncProtocol.messageYjsSyncStep2;
      handle.receive(syncFrame(step, update));
    },
    announce: (clientID = doc.clientID) => handle.receive(awarenessFrame(clientID, (clock += 1))),
    leave: () => handle.disconnect(),
  };
}
