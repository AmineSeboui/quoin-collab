import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { CollabProvider } from 'quoin-collab-client';
import { memoryPersistence } from '../src/persistence/memory.ts';
import { createCollabServer } from '../src/server.ts';
import { startStandalone, type Standalone } from '../src/standalone/http-server.ts';
import { signRoomToken, tokenAuthorize } from '../src/token.ts';

/**
 * The claim this file exists to keep honest: the wire is y-websocket's, so the standard client talks to this
 * server and this client talks to the standard server. Nobody has to take that on trust, and nobody is stuck
 * here because of the protocol.
 */

const waitFor = async (condition: () => boolean, timeoutMs = 6_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

let running: Standalone | null = null;
let collab: ReturnType<typeof createCollabServer> | null = null;
const started: WebsocketProvider[] = [];

afterEach(async () => {
  for (const provider of started.splice(0)) provider.destroy();
  await running?.close();
  await collab?.close();
  running = null;
  collab = null;
});

const port = () => 15_000 + Math.floor(Math.random() * 1_000);

/**
 * `disableBc` matters more than it looks. y-websocket syncs instances in one process over a BroadcastChannel
 * by default, so two clients here would agree with each other without the server ever carrying anything, and
 * a compatibility test would pass while proving nothing.
 */
const yWebsocket = (url: string, room: string, params?: Record<string, string>, carrying?: Y.Doc) => {
  const doc = carrying ?? new Y.Doc();
  const provider = new WebsocketProvider(url, room, doc, { params, WebSocketPolyfill: WebSocket, disableBc: true });
  started.push(provider);
  return { doc, provider };
};

describe('a plain y-websocket client', () => {
  it('syncs with this server, with no Quoin package involved on the client at all', async () => {
    const at = port();
    collab = createCollabServer();
    running = await startStandalone({ collab, port: at, host: '127.0.0.1' });
    const url = `ws://127.0.0.1:${at}`;

    const ada = yWebsocket(url, 'notes');
    const grace = yWebsocket(url, 'notes');
    await waitFor(() => ada.provider.synced && grace.provider.synced);

    ada.doc.getText('quoin').insert(0, 'typed by y-websocket');
    await waitFor(() => grace.doc.getText('quoin').toString() === 'typed by y-websocket');

    expect(grace.doc.getText('quoin').toString()).toBe('typed by y-websocket');
  });

  it('reaches a Quoin client in the same room, in both directions', async () => {
    const at = port();
    collab = createCollabServer();
    running = await startStandalone({ collab, port: at, host: '127.0.0.1' });
    const url = `ws://127.0.0.1:${at}`;

    const standard = yWebsocket(url, 'shared');
    const ours = new CollabProvider({ url, room: 'shared' });
    await waitFor(() => standard.provider.synced && ours.synced);

    standard.doc.getText('quoin').insert(0, 'from the standard client');
    await waitFor(() => ours.doc.getText('quoin').toString().includes('standard'));

    ours.doc.getText('quoin').insert(0, 'and back again, ');
    await waitFor(() => standard.doc.getText('quoin').toString().startsWith('and back again'));

    expect(standard.doc.getText('quoin').toString()).toBe('and back again, from the standard client');
    ours.destroy();
  });

  it('carries presence, since awareness is the same protocol too', async () => {
    const at = port();
    collab = createCollabServer();
    running = await startStandalone({ collab, port: at, host: '127.0.0.1' });
    const url = `ws://127.0.0.1:${at}`;

    const standard = yWebsocket(url, 'who-is-here');
    const ours = new CollabProvider({ url, room: 'who-is-here' });
    await waitFor(() => standard.provider.synced && ours.synced);

    standard.provider.awareness.setLocalStateField('user', { name: 'Ada' });
    await waitFor(() => [...ours.awareness.getStates().values()].some((state) => state.user?.name === 'Ada'));

    expect([...ours.awareness.getStates().values()].some((state) => state.user?.name === 'Ada')).toBe(true);
    ours.destroy();
  });

  it('passes a room token the way the hosted service expects, as a query parameter', async () => {
    const at = port();
    const secret = 'a-shared-secret';
    collab = createCollabServer({ authorize: tokenAuthorize(secret) });
    running = await startStandalone({ collab, port: at, host: '127.0.0.1' });
    const url = `ws://127.0.0.1:${at}`;
    const token = signRoomToken({ room: 'guarded', exp: Math.floor(Date.now() / 1000) + 60 }, secret);

    const allowed = yWebsocket(url, 'guarded', { token });
    await waitFor(() => allowed.provider.synced);

    expect(allowed.provider.synced).toBe(true);
  });
});

describe('a document taken out of this server', () => {
  it('is a plain Yjs update, which a bare Y.Doc reads with nothing of ours involved', async () => {
    const at = port();
    const store = memoryPersistence();
    collab = createCollabServer({ persistence: store, saveAfterMs: 1 });
    running = await startStandalone({ collab, port: at, host: '127.0.0.1' });

    const author = yWebsocket(`ws://127.0.0.1:${at}`, 'leaving');
    const reader = yWebsocket(`ws://127.0.0.1:${at}`, 'leaving');
    await waitFor(() => author.provider.synced && reader.provider.synced);
    author.doc.getText('quoin').insert(0, 'this leaves with you');
    // Through the reader, so the server is known to hold the change before it is asked to write it out.
    await waitFor(() => reader.doc.getText('quoin').toString() === 'this leaves with you');
    await collab.flush();

    const exported = await store.load('leaving');
    expect(exported).not.toBeNull();

    const elsewhere = new Y.Doc();
    Y.applyUpdate(elsewhere, exported!);
    expect(elsewhere.getText('quoin').toString()).toBe('this leaves with you');
  });
});

describe('a document that already exists somewhere else', () => {
  it('is moved in by connecting a client that is holding it', async () => {
    const at = port();
    collab = createCollabServer({ saveAfterMs: 1 });
    running = await startStandalone({ collab, port: at, host: '127.0.0.1' });
    const url = `ws://127.0.0.1:${at}`;

    const existing = new Y.Doc();
    existing.getText('quoin').insert(0, 'written long before this service existed');

    const moving = yWebsocket(url, 'moved-in', undefined, existing);
    await waitFor(() => moving.provider.synced);

    const afterwards = yWebsocket(url, 'moved-in');
    await waitFor(() => afterwards.doc.getText('quoin').toString().includes('long before'));

    expect(afterwards.doc.getText('quoin').toString()).toBe('written long before this service existed');
  });
});
