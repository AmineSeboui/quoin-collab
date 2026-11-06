import { describe, expect, it } from 'vitest';
import { CollabProvider } from 'quoin-collab-client';
import { createCollabServer } from '../src/server.ts';
import { memoryPersistence } from '../src/persistence/memory.ts';
import { socketsTo } from './fake-socket.ts';
import { settle } from './settle.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('a room nobody is in', () => {
  it('comes back with what was written to it', async () => {
    const persistence = memoryPersistence();
    const first = createCollabServer({ persistence, saveAfterMs: 1, evictAfterMs: 1 });
    const ada = new CollabProvider({ url: 'wss://quoin.test/c', room: 'kept', socketFactory: socketsTo(first, 'kept').factory });
    await settle();
    ada.doc.getText('quoin').insert(0, 'written down');
    await settle();
    ada.destroy();
    await sleep(30);
    await first.close();

    const second = createCollabServer({ persistence });
    const grace = new CollabProvider({ url: 'wss://quoin.test/c', room: 'kept', socketFactory: socketsTo(second, 'kept').factory });
    await settle();

    expect(grace.doc.getText('quoin').toString()).toBe('written down');
    await second.close();
  });

  it('is dropped from memory once it is empty', async () => {
    const collab = createCollabServer({ saveAfterMs: 1, evictAfterMs: 1 });
    const ada = new CollabProvider({ url: 'wss://quoin.test/c', room: 'brief', socketFactory: socketsTo(collab, 'brief').factory });
    await settle();
    expect(collab.stats()).toEqual({ rooms: 1, connections: 1 });

    ada.destroy();
    await sleep(30);

    expect(collab.stats().rooms).toBe(0);
    await collab.close();
  });

  it('is kept loaded while somebody is still in it', async () => {
    const collab = createCollabServer({ saveAfterMs: 1, evictAfterMs: 1 });
    const ada = new CollabProvider({ url: 'wss://quoin.test/c', room: 'busy', socketFactory: socketsTo(collab, 'busy').factory });
    const grace = new CollabProvider({ url: 'wss://quoin.test/c', room: 'busy', socketFactory: socketsTo(collab, 'busy').factory });
    await settle();

    ada.destroy();
    await sleep(30);

    expect(collab.stats()).toEqual({ rooms: 1, connections: 1 });
    grace.destroy();
    await collab.close();
  });
});
