import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { memoryFanout } from '../../src/fanout/memory.ts';
import { memoryPersistence } from '../../src/persistence/memory.ts';
import { guest, repliesOf, replyTo } from '../comments/store.ts';
import { peer } from '../peer.ts';
import { settle } from '../settle.ts';
import { commenter, held, lin, reply, serve, write } from './setup.ts';

describe('a commenter writing under its own client id', () => {
  it('is accepted the first time, under an id the room has never seen', async () => {
    const collab = serve();
    const grace = commenter(collab);
    await settle();

    replyTo(grace.provider.doc, 't-1', 'r-1', guest);
    await settle();

    expect(grace.denied).toEqual([]);
    expect(repliesOf(await held(collab)).has('r-1')).toBe(true);
    await collab.close();
  });

  it('still works after a reconnect to the same room', async () => {
    const collab = serve();
    const ada = await peer(collab, 'notes', 'writer');
    ada.announce();
    const grace = commenter(collab);
    await settle();
    replyTo(grace.provider.doc, 't-1', 'r-1', guest);
    await settle();

    grace.provider.disconnect();
    await settle();
    grace.provider.connect();
    await settle();
    replyTo(grace.provider.doc, 't-1', 'r-2', guest);
    await settle();

    expect(grace.denied).toEqual([]);
    expect([...repliesOf(await held(collab)).keys()].sort()).toEqual(['r-1', 'r-2']);
    await collab.close();
  });

  it('still works after a reconnect to a room freshly loaded from storage', async () => {
    const persistence = memoryPersistence();
    const one = serve({ persistence });
    const grace = commenter(one);
    await settle();
    replyTo(grace.provider.doc, 't-1', 'r-1', guest);
    await settle();
    grace.provider.disconnect();
    await one.close();

    const two = serve({ persistence });
    grace.moveTo(two);
    grace.provider.connect();
    await settle();
    replyTo(grace.provider.doc, 't-1', 'r-2', guest);
    await settle();

    expect(grace.denied).toEqual([]);
    expect([...repliesOf(await held(two)).keys()].sort()).toEqual(['r-1', 'r-2']);
    await two.close();
  });

  it('still works after a reconnect to another process serving the room', async () => {
    const fanout = memoryFanout();
    const persistence = memoryPersistence();
    const one = serve({ fanout, persistence, serverId: 'one' });
    const two = serve({ fanout, persistence, serverId: 'two' });
    const ada = await peer(two, 'notes', 'writer');
    const grace = commenter(one);
    await settle();
    replyTo(grace.provider.doc, 't-1', 'r-1', guest);
    await settle();

    grace.provider.disconnect();
    grace.moveTo(two);
    grace.provider.connect();
    await settle();
    replyTo(grace.provider.doc, 't-1', 'r-2', guest);
    await settle();

    expect(grace.denied).toEqual([]);
    expect([...repliesOf(ada.doc).keys()].sort()).toEqual(['r-1', 'r-2']);
    await Promise.all([one.close(), two.close()]);
  });

  it('still works for a first comment after moving to another process', async () => {
    const fanout = memoryFanout();
    const persistence = memoryPersistence();
    const one = serve({ fanout, persistence, serverId: 'one' });
    const two = serve({ fanout, persistence, serverId: 'two' });
    const watcher = await peer(two, 'notes', 'lin');
    const grace = commenter(one);
    await settle();

    grace.provider.disconnect();
    await settle();
    grace.moveTo(two);
    grace.provider.connect();
    await settle();
    replyTo(grace.provider.doc, 't-1', 'r-1', guest);
    await settle();

    expect(grace.denied).toEqual([]);
    expect(repliesOf(watcher.doc).has('r-1')).toBe(true);
    await Promise.all([one.close(), two.close()]);
  });

  it('is accepted under the id its reading connection announced, once the reader may comment', async () => {
    const collab = serve();
    const ada = await peer(collab, 'notes', 'writer');
    await peer(collab, 'notes', 'lin');
    const grace = commenter(collab, 'reader-grace');
    await settle();

    grace.provider.disconnect();
    grace.grant('guest');
    grace.provider.connect();
    await settle();
    replyTo(grace.provider.doc, 't-1', 'r-1', guest);
    await settle();

    expect(grace.denied).toEqual([]);
    expect(repliesOf(ada.doc).has('r-1')).toBe(true);
    await collab.close();
  });

  it('is recorded under one client id of the room’s own, however many commenters claim', async () => {
    const collab = serve();
    const ada = await peer(collab, 'notes', 'writer');
    ada.send(ada.change(write('hello')));
    const grace = await peer(collab, 'notes', 'guest');
    const mallory = await peer(collab, 'notes', 'lin');
    await settle();

    grace.send(grace.change(reply('r-1')));
    mallory.send(mallory.change(reply('r-2', lin)));
    await settle();

    const room = await held(collab);
    expect([...repliesOf(room).keys()].sort()).toEqual(['r-1', 'r-2']);
    expect(Y.decodeStateVector(Y.encodeStateVector(room)).size).toBe(4);
    await collab.close();
  });

  it('brings back, in its sync step 2, its own comments a room lost', async () => {
    const forgetful = { load: async () => null, save: async () => undefined };
    const one = serve({ persistence: forgetful });
    const grace = commenter(one);
    await settle();
    replyTo(grace.provider.doc, 't-1', 'r-1', guest);
    await settle();
    grace.provider.disconnect();
    await one.close();

    const two = serve({ persistence: forgetful });
    grace.moveTo(two);
    grace.provider.connect();
    await settle();

    expect(grace.denied).toEqual([]);
    expect(repliesOf(await held(two)).has('r-1')).toBe(true);
    await two.close();
  });
});
