import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import { clientIdFrame, MESSAGE_AWARENESS, readFrame, syncStep1 } from '../src/protocol/index.ts';
import { connected, writes, type ScriptedSocket } from './scripted-socket.ts';

/** The client ids the provider's awareness frames announce with a state. */
const announced = (socket: ScriptedSocket) =>
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
    const { provider, socket, reconnect } = await connected();
    provider.awareness.setLocalStateField('user', { name: 'Grace' });
    socket().deliver(clientIdFrame(42));

    await reconnect();

    expect(provider.awareness.getLocalState()).not.toBeNull();
    expect(announced(socket())).toEqual([provider.awareness.clientID]);
    provider.destroy();
  });
});
