import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import {
  MESSAGE_AUTH,
  MESSAGE_AWARENESS,
  MESSAGE_CLIENT_ID,
  MESSAGE_SYNC,
  readClientId,
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
  /** The type of every frame the server sent, in order. */
  readonly frames: number[];
  /** The client id the server assigned this socket, if it assigned one. */
  readonly assigned: number | null;
  /** Makes a change in the peer's own copy and returns the update, without sending it. */
  change(make: (doc: Y.Doc) => void): Uint8Array;
  /** Sends an update as a live change, or as the sync step 2 a client sends while reconnecting. */
  send(update: Uint8Array, as?: 'live' | 'handshake'): void;
  /**
   * Tells the room this socket is here, or with `present` false that it has gone, under its own client id unless
   * another is given, at the next clock of its own unless another is given: an announcement at a clock no higher than
   * the room's last for that id is ignored.
   */
  announce(clientID?: number, clock?: number, present?: boolean): void;
  leave(): void;
};

export type PeerOptions = {
  /** False for a client that ignores the client id the server assigns, and keeps writing under its own. */
  adopt?: boolean;
};

const syncFrame = (step: number, update: Uint8Array): Uint8Array => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  encoding.writeVarUint(encoder, step);
  encoding.writeVarUint8Array(encoder, update);
  return encoding.toUint8Array(encoder);
};

const awarenessFrame = (clientID: number, clock: number, present: boolean): Uint8Array => {
  const update = encoding.createEncoder();
  encoding.writeVarUint(update, 1);
  encoding.writeVarUint(update, clientID);
  encoding.writeVarUint(update, clock);
  encoding.writeVarString(update, JSON.stringify(present ? { user: { name: 'someone' } } : null));
  const frame = encoding.createEncoder();
  encoding.writeVarUint(frame, MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(frame, encoding.toUint8Array(update));
  return encoding.toUint8Array(frame);
};

/**
 * A socket driven by hand, for sending what no honest client would. Its copy of the room is kept in step with what
 * the server sends, so a change made on it lands where the room expects it, and like an honest client it writes under
 * the client id the server assigns unless told not to.
 */
export async function peer(
  collab: CollabServer,
  room: string,
  token: string | null = null,
  { adopt = true }: PeerOptions = {},
): Promise<Peer> {
  const doc = new Y.Doc();
  const events: string[] = [];
  const frames: number[] = [];
  let assigned: number | null = null;
  let clock = 0;
  const handle = await collab.connect(
    { room, token, headers: {} },
    {
      send: (data) => {
        const { type, decoder } = readFrame(data);
        frames.push(type);
        if (type === MESSAGE_SYNC) syncProtocol.readSyncMessage(decoder, encoding.createEncoder(), doc, FROM_SERVER);
        else if (type === MESSAGE_AUTH) events.push(`denied:${readDenial(decoder)}`);
        else if (type === MESSAGE_CLIENT_ID) {
          assigned = readClientId(decoder);
          if (adopt) doc.clientID = assigned;
        }
      },
      close: (code, reason) => events.push(`closed:${code}:${reason}`),
    },
  );
  if (handle === null) throw new Error(`${room} turned the peer away`);
  handle.receive(syncStep1(doc));

  return {
    doc,
    events,
    frames,
    get assigned() {
      return assigned;
    },
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
    announce: (clientID = doc.clientID, at = (clock += 1), present = true) =>
      handle.receive(awarenessFrame(clientID, at, present)),
    leave: () => handle.disconnect(),
  };
}
