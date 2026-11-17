import { describe, expect, it } from 'vitest';
import { memoryFanout } from '../../src/fanout/memory.ts';
import { memoryPersistence } from '../../src/persistence/memory.ts';
import { repliesOf } from '../comments/store.ts';
import { peer, type Peer } from '../peer.ts';
import { settle } from '../settle.ts';
import { forge, held, lin, REFUSED, reply, serve } from './setup.ts';

/** Lin's first comment, under the client id she announced at clock 1 as an editor does once it names its user. */
const comment = (who: Peer) => who.send(who.change(reply('r-lin', lin)));

describe('a commenter’s first comment, after someone repeats its client id', () => {
  it('still lands when another commenter repeated it, who cannot then write under it', async () => {
    const collab = serve();
    const linsPeer = await peer(collab, 'notes', 'lin');
    linsPeer.announce();
    const mallory = await peer(collab, 'notes', 'guest');
    await settle();

    mallory.announce(linsPeer.doc.clientID, 2);
    forge(mallory, linsPeer.doc.clientID, reply('r-forged'));
    mallory.leave();
    linsPeer.announce(linsPeer.doc.clientID, 3);
    comment(linsPeer);
    await settle();

    expect(mallory.events).toEqual(REFUSED);
    expect(linsPeer.events).toEqual([]);
    expect([...repliesOf(await held(collab)).keys()]).toEqual(['r-lin']);
    await collab.close();
  });

  it('still lands when a reader repeated it and is still here', async () => {
    const collab = serve();
    const linsPeer = await peer(collab, 'notes', 'lin');
    linsPeer.announce();
    const reader = await peer(collab, 'notes', 'reader');
    await settle();

    reader.announce(linsPeer.doc.clientID, 2);
    comment(linsPeer);
    await settle();

    expect(linsPeer.events).toEqual([]);
    expect(repliesOf(await held(collab)).has('r-lin')).toBe(true);
    await collab.close();
  });

  it('still lands when the repeat came from another process, through the fanout', async () => {
    const fanout = memoryFanout();
    const persistence = memoryPersistence();
    const one = serve({ fanout, persistence, serverId: 'one' });
    const two = serve({ fanout, persistence, serverId: 'two' });
    const linsPeer = await peer(two, 'notes', 'lin');
    linsPeer.announce();
    const mallory = await peer(one, 'notes', 'guest');
    await settle();

    mallory.announce(linsPeer.doc.clientID, 2);
    await settle();
    comment(linsPeer);
    await settle();

    expect(linsPeer.events).toEqual([]);
    expect(repliesOf(await held(two)).has('r-lin')).toBe(true);
    await Promise.all([one.close(), two.close()]);
  });
});
