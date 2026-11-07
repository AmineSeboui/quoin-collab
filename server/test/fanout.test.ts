import { describe, expect, it } from 'vitest';
import { CollabProvider } from 'quoin-collab-client';
import { createCollabServer } from '../src/server.ts';
import { memoryFanout } from '../src/fanout/memory.ts';
import { memoryPersistence } from '../src/persistence/memory.ts';
import { socketsTo } from './fake-socket.ts';
import { settle } from './settle.ts';

/**
 * Two server processes standing in for two function instances, which is what a client reaching a serverless
 * deployment gets: the connections for one room land wherever they land, so the processes must talk.
 */
describe('a room served by two processes', () => {
  it('reaches a client attached to the other one', async () => {
    const fanout = memoryFanout();
    const persistence = memoryPersistence();
    const one = createCollabServer({ fanout, persistence, serverId: 'one' });
    const two = createCollabServer({ fanout, persistence, serverId: 'two' });

    const ada = new CollabProvider({ url: 'wss://quoin.test/c', room: 'shared', socketFactory: socketsTo(one, 'shared').factory });
    const grace = new CollabProvider({ url: 'wss://quoin.test/c', room: 'shared', socketFactory: socketsTo(two, 'shared').factory });
    await settle();

    ada.doc.getText('quoin').insert(0, 'across instances');
    await settle();

    expect(grace.doc.getText('quoin').toString()).toBe('across instances');
    await Promise.all([one.close(), two.close()]);
  });

  it('carries presence across them too', async () => {
    const fanout = memoryFanout();
    const persistence = memoryPersistence();
    const one = createCollabServer({ fanout, persistence, serverId: 'one' });
    const two = createCollabServer({ fanout, persistence, serverId: 'two' });
    const ada = new CollabProvider({ url: 'wss://quoin.test/c', room: 'shared', socketFactory: socketsTo(one, 'shared').factory });
    const grace = new CollabProvider({ url: 'wss://quoin.test/c', room: 'shared', socketFactory: socketsTo(two, 'shared').factory });
    await settle();

    ada.awareness.setLocalStateField('user', { name: 'Ada' });
    await settle();

    const names = [...grace.awareness.getStates().values()].map((state) => (state as { user?: { name: string } }).user?.name);
    expect(names).toContain('Ada');
    await Promise.all([one.close(), two.close()]);
  });

  it('does not hand a process back its own change', async () => {
    const fanout = memoryFanout();
    const published: string[] = [];
    const watched = {
      publish: (room: string, message: Parameters<typeof fanout.publish>[1]) => {
        published.push(message.from);
        fanout.publish(room, message);
      },
      subscribe: fanout.subscribe,
    };
    const one = createCollabServer({ fanout: watched, serverId: 'one' });
    const two = createCollabServer({ fanout: watched, serverId: 'two' });
    const ada = new CollabProvider({ url: 'wss://quoin.test/c', room: 'r', socketFactory: socketsTo(one, 'r').factory });
    new CollabProvider({ url: 'wss://quoin.test/c', room: 'r', socketFactory: socketsTo(two, 'r').factory });
    await settle();

    ada.doc.getText('quoin').insert(0, 'x');
    await settle();

    expect(published).not.toContain('two');
    await Promise.all([one.close(), two.close()]);
  });
});

describe('a subscription that takes time to become live', () => {
  it('is awaited before the room is served, since pub/sub does not replay', async () => {
    let listening = false;
    const inner = memoryFanout();
    const slow = {
      publish: inner.publish,
      subscribe: (room: string, listener: Parameters<typeof inner.subscribe>[1]) => {
        const subscription = inner.subscribe(room, listener);
        return {
          ready: new Promise<void>((resolve) =>
            setTimeout(() => {
              listening = true;
              resolve();
            }, 80),
          ),
          stop: subscription.stop,
        };
      },
    };
    const collab = createCollabServer({ fanout: slow });
    const ada = new CollabProvider({
      url: 'wss://quoin.test/c',
      room: 'slow',
      socketFactory: socketsTo(collab, 'slow').factory,
    });

    const waited = Date.now();
    while (!ada.synced && Date.now() - waited < 3_000) await new Promise((r) => setTimeout(r, 10));

    expect(ada.synced).toBe(true);
    expect(listening).toBe(true);
    ada.destroy();
    await collab.close();
  });
});
