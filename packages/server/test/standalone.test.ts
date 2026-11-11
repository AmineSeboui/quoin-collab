import { afterEach, describe, expect, it } from 'vitest';
import { CollabProvider } from 'quoin-collab-client';
import { createCollabServer } from '../src/server.ts';
import { startStandalone, type Standalone } from '../src/standalone/http-server.ts';
import { signRoomToken, tokenAuthorize } from '../src/token.ts';

const waitFor = async (condition: () => boolean, timeoutMs = 4_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

let running: Standalone | null = null;
let collab: ReturnType<typeof createCollabServer> | null = null;

afterEach(async () => {
  await running?.close();
  await collab?.close();
  running = null;
  collab = null;
});

const port = () => 14_000 + Math.floor(Math.random() * 1_000);

describe('the standalone server over a real socket', () => {
  it('syncs two clients', async () => {
    const at = port();
    collab = createCollabServer();
    running = await startStandalone({ collab, port: at, host: '127.0.0.1' });
    const url = `ws://127.0.0.1:${at}`;

    const ada = new CollabProvider({ url, room: 'notes' });
    const grace = new CollabProvider({ url, room: 'notes' });
    await waitFor(() => ada.synced && grace.synced);

    ada.doc.getText('quoin').insert(0, 'over the wire');
    await waitFor(() => grace.doc.getText('quoin').toString() === 'over the wire');

    expect(grace.doc.getText('quoin').toString()).toBe('over the wire');
    ada.destroy();
    grace.destroy();
  });

  it('answers a health check with what it is serving', async () => {
    const at = port();
    collab = createCollabServer();
    running = await startStandalone({ collab, port: at, host: '127.0.0.1' });

    const response = await fetch(`http://127.0.0.1:${at}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', rooms: 0, connections: 0 });
  });

  it('lets a signed token in and keeps an unsigned one out', async () => {
    const at = port();
    const secret = 'standalone-secret';
    collab = createCollabServer({ authorize: tokenAuthorize(secret) });
    running = await startStandalone({ collab, port: at, host: '127.0.0.1' });
    const url = `ws://127.0.0.1:${at}`;

    const token = signRoomToken({ room: 'notes', exp: Math.floor(Date.now() / 1000) + 60 }, secret);
    const allowed = new CollabProvider({ url, room: 'notes', token });
    await waitFor(() => allowed.synced);
    expect(allowed.synced).toBe(true);

    const refused = new CollabProvider({ url, room: 'notes', token: 'forged.token' });
    const reasons: string[] = [];
    refused.on('denied', (reason) => reasons.push(reason));
    await waitFor(() => reasons.length > 0);

    expect(reasons[0]).toContain('not open to you');
    allowed.destroy();
    refused.destroy();
  });
});
