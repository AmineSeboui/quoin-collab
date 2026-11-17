import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import { clientIdFrame, MESSAGE_AWARENESS, MESSAGE_SYNC, readFrame, syncStep1 } from '../src/protocol/index.ts';
import { CollabProvider } from '../src/provider.ts';

/** A socket that keeps what the provider sends and hands it frames when told to. */
class FakeSocket {
  binaryType = 'arraybuffer';
  readyState = 1;
  readonly sent: Uint8Array[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  open(): void {
    this.onopen?.();
  }

  deliver(frame: Uint8Array): void {
    this.onmessage?.({ data: frame.slice().buffer } as MessageEvent<ArrayBuffer>);
  }

  drop(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  send(data: Uint8Array): void {
    this.sent.push(new Uint8Array(data));
  }

  close(): void {
    this.drop();
  }
}

const settle = async () => {
  for (let flush = 0; flush < 6; flush++) await Promise.resolve();
};

async function connected() {
  const sockets: FakeSocket[] = [];
  const provider = new CollabProvider({
    url: 'ws://localhost:1234',
    room: 'notes',
    connect: false,
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
  });
  provider.connect();
  await settle();
  sockets.at(-1)!.open();
  return { provider, sockets, socket: () => sockets.at(-1)! };
}

/** The client ids each update the provider sent writes structs under, with the sync step that carried it. */
const writes = (socket: FakeSocket) =>
  socket.sent.flatMap((data) => {
    const { type, decoder } = readFrame(data);
    if (type !== MESSAGE_SYNC) return [];
    const step = decoding.readVarUint(decoder);
    if (step === syncProtocol.messageYjsSyncStep1) return [];
    return [{ step, writers: [...Y.parseUpdateMeta(decoding.readVarUint8Array(decoder)).from.keys()] }];
  });

/** The client ids the provider's awareness frames announce with a state. */
const announced = (socket: FakeSocket) =>
  socket.sent.flatMap((data) => {
    const { type, decoder } = readFrame(data);
    if (type !== MESSAGE_AWARENESS) return [];
    const update = decoding.createDecoder(decoding.readVarUint8Array(decoder));
    const ids: number[] = [];
    for (let left = decoding.readVarUint(update); left > 0; left -= 1) {
      const id = decoding.readVarUint(update);
      decoding.readVarUint(update);
      if (JSON.parse(decoding.readVarString(update)) !== null) ids.push(id);
    }
    return ids;
  });

const comment = (doc: Y.Doc) => doc.getMap('comment-replies').set('r-1', { id: 'r-1' });

describe('the client id a server assigns', () => {
  it('is what the document writes under, and no change goes out before the server has spoken', async () => {
    const { provider, socket } = await connected();

    comment(provider.doc);
    expect(writes(socket())).toEqual([]);

    socket().deliver(clientIdFrame(42));
    provider.doc.getMap('comment-replies').set('r-2', { id: 'r-2' });

    expect(provider.doc.clientID).toBe(42);
    expect(writes(socket())).toEqual([{ step: syncProtocol.messageYjsUpdate, writers: [42] }]);
    provider.destroy();
  });

  it('leaves a change made before the server spoke to the sync step 2 that answers it', async () => {
    const { provider, socket } = await connected();
    const original = provider.doc.clientID;

    comment(provider.doc);
    socket().deliver(syncStep1(new Y.Doc()));

    expect(writes(socket())).toEqual([{ step: syncProtocol.messageYjsSyncStep2, writers: [original] }]);
    provider.destroy();
  });

  it('keeps the client’s own presence under its awareness id once the document’s id has changed', async () => {
    const { provider, socket } = await connected();
    provider.awareness.setLocalStateField('user', { name: 'Grace' });
    socket().deliver(clientIdFrame(42));

    socket().drop();
    provider.disconnect();
    provider.connect();
    await settle();
    socket().open();

    expect(provider.awareness.getLocalState()).not.toBeNull();
    expect(announced(socket())).toEqual([provider.awareness.clientID]);
    provider.destroy();
  });
});
