import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import { clientIdFrame, syncStep1 } from '../src/protocol/index.ts';
import { connected, settle, writes } from './scripted-socket.ts';

const comment = (doc: Y.Doc, id: string) => doc.getMap('comment-replies').set(id, { id });

/** A server's document holding what `doc` holds now, so its sync step 1 asks for nothing written so far. */
const serverHolding = (doc: Y.Doc) => {
  const server = new Y.Doc();
  Y.applyUpdate(server, Y.encodeStateAsUpdate(doc));
  return server;
};

describe('a change written under a client id assigned on an earlier connection', () => {
  it('is reported as refused, and the provider closes rather than answer, when the server never got it', async () => {
    const { provider, sockets, socket, reconnect } = await connected();
    const denied: string[] = [];
    provider.on('denied', (reason) => denied.push(reason));
    socket().deliver(clientIdFrame(42));
    comment(provider.doc, 'r-lost');

    await reconnect();
    socket().deliver(clientIdFrame(43));
    socket().deliver(syncStep1(new Y.Doc()));
    await settle();

    expect(denied).toEqual(['refused']);
    expect(writes(socket())).toEqual([]);
    expect(provider.status).toBe('offline');
    expect(provider.synced).toBe(false);
    expect(sockets).toHaveLength(2);
    provider.destroy();
  });

  it('is answered as before when the server has it', async () => {
    const { provider, socket, reconnect } = await connected();
    const denied: string[] = [];
    provider.on('denied', (reason) => denied.push(reason));
    socket().deliver(clientIdFrame(42));
    comment(provider.doc, 'r-saved');
    const server = serverHolding(provider.doc);

    await reconnect();
    socket().deliver(clientIdFrame(43));
    socket().deliver(syncStep1(server));

    expect(denied).toEqual([]);
    expect(writes(socket())).toEqual([{ step: syncProtocol.messageYjsSyncStep2, writers: [] }]);
    expect(provider.status).toBe('connected');
    provider.destroy();
  });
});

describe('a writer or a reader, which the server never assigns an id', () => {
  it('answers with a change lost in flight, as before, and is not told it was refused', async () => {
    const { provider, socket, reconnect } = await connected();
    const denied: string[] = [];
    provider.on('denied', (reason) => denied.push(reason));
    const own = provider.doc.clientID;
    socket().deliver(syncStep1(new Y.Doc()));
    provider.doc.getText('quoin').insert(0, 'lost on the way');

    await reconnect();
    socket().deliver(syncStep1(new Y.Doc()));

    expect(denied).toEqual([]);
    expect(writes(socket())).toEqual([{ step: syncProtocol.messageYjsSyncStep2, writers: [own] }]);
    expect(provider.status).toBe('connected');
    provider.destroy();
  });
});
