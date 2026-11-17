import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { COMMENTERS } from '../../src/client-ids/claims.ts';
import { memoryFanout } from '../../src/fanout/memory.ts';
import { memoryPersistence } from '../../src/persistence/memory.ts';
import { guest, repliesOf, replyTo } from '../comments/store.ts';
import { peer } from '../peer.ts';
import { settle } from '../settle.ts';
import { commenter, forge, held, lin, REFUSED, reply, serve, textOf, write } from './setup.ts';

describe('a commenter writing under a client id that is not its own', () => {
  it('is refused for a writer’s id from the state vector, and the writer’s edit there still lands', async () => {
    const collab = serve();
    const ada = await peer(collab, 'notes', 'writer');
    ada.send(ada.change(write('hello')));
    const mallory = await peer(collab, 'notes', 'guest');
    await settle();
    const [writerId] = [...Y.decodeStateVector(Y.encodeStateVector(mallory.doc)).keys()];
    const inFlight = ada.change(write(' world', 5));

    forge(mallory, writerId!, reply('r-forged'));
    ada.send(inFlight);
    await settle();

    const room = await held(collab);
    expect(mallory.events).toEqual(REFUSED);
    expect(textOf(room)).toBe('hello world');
    expect(repliesOf(room).has('r-forged')).toBe(false);
    await collab.close();
  });

  it('is refused for an id another connection here announced before any commenter came', async () => {
    const collab = serve();
    const ada = await peer(collab, 'notes', 'writer');
    ada.announce();
    const mallory = await peer(collab, 'notes', 'guest');
    await settle();
    const inFlight = ada.change(write('first words'));

    forge(mallory, ada.doc.clientID, reply('r-forged'));
    ada.send(inFlight);
    await settle();

    expect(mallory.events).toEqual(REFUSED);
    expect(textOf(await held(collab))).toBe('first words');
    await collab.close();
  });

  it('is refused for an id another connection announced first, though the commenter announces it too', async () => {
    const collab = serve();
    const mallory = await peer(collab, 'notes', 'guest');
    const ada = await peer(collab, 'notes', 'writer');
    ada.announce();
    mallory.announce(ada.doc.clientID, 2);
    await settle();
    const inFlight = ada.change(write('first words'));

    forge(mallory, ada.doc.clientID, reply('r-forged'));
    ada.send(inFlight);
    await settle();

    expect(mallory.events).toEqual(REFUSED);
    expect(textOf(await held(collab))).toBe('first words');
    await collab.close();
  });

  it('is refused for an id announced on another process, which arrives through the fanout', async () => {
    const fanout = memoryFanout();
    const persistence = memoryPersistence();
    const one = serve({ fanout, persistence, serverId: 'one' });
    const two = serve({ fanout, persistence, serverId: 'two' });
    const mallory = await peer(two, 'notes', 'guest');
    const ada = await peer(one, 'notes', 'writer');
    ada.announce();
    await settle();
    const inFlight = ada.change(write('first words'));

    forge(mallory, ada.doc.clientID, reply('r-forged'));
    ada.send(inFlight);
    await settle();

    expect(mallory.events).toEqual(REFUSED);
    expect(textOf(await held(two))).toBe('first words');
    await Promise.all([one.close(), two.close()]);
  });

  it('is refused for another commenter’s id, once it has written', async () => {
    const collab = serve();
    const grace = await peer(collab, 'notes', 'guest');
    grace.announce();
    grace.send(grace.change(reply('r-1')));
    const mallory = await peer(collab, 'notes', 'lin');
    await settle();
    const inFlight = grace.change(reply('r-2'));

    forge(mallory, grace.doc.clientID, reply('r-lin', lin));
    grace.send(inFlight);
    await settle();

    const room = await held(collab);
    expect(mallory.events).toEqual(REFUSED);
    expect(grace.events).toEqual([]);
    expect([...repliesOf(room).keys()].sort()).toEqual(['r-1', 'r-2']);
    await collab.close();
  });

  it('cannot be made its own by writing the record of claims itself', async () => {
    const collab = serve();
    const ada = await peer(collab, 'notes', 'writer');
    ada.send(ada.change(write('hello')));
    const grace = commenter(collab);
    await settle();
    replyTo(grace.provider.doc, 't-1', 'r-1', guest);
    const mallory = await peer(collab, 'notes', 'lin');
    await settle();

    mallory.send(mallory.change((doc) => doc.getMap(COMMENTERS).set(String(ada.doc.clientID), lin.id)));
    await settle();

    expect(mallory.events).toEqual(REFUSED);
    expect((await held(collab)).getMap(COMMENTERS).has(String(ada.doc.clientID))).toBe(false);
    await collab.close();
  });

  it('is refused for another commenter’s id it has only announced', async () => {
    const collab = serve();
    const grace = await peer(collab, 'notes', 'guest');
    grace.announce();
    const mallory = await peer(collab, 'notes', 'lin');
    await settle();
    const inFlight = grace.change(reply('r-1'));

    forge(mallory, grace.doc.clientID, reply('r-lin', lin));
    grace.send(inFlight);
    await settle();

    expect(mallory.events).toEqual(REFUSED);
    expect(grace.events).toEqual([]);
    expect([...repliesOf(await held(collab)).keys()]).toEqual(['r-1']);
    await collab.close();
  });
});
