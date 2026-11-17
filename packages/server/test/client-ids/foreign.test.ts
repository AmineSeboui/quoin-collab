import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { memoryFanout } from '../../src/fanout/memory.ts';
import { memoryPersistence } from '../../src/persistence/memory.ts';
import { repliesOf } from '../comments/store.ts';
import { peer } from '../peer.ts';
import { settle } from '../settle.ts';
import { forge, held, lin, REFUSED, reply, serve, textOf, write } from './setup.ts';

/** A writer who has announced herself and not written yet, with her first edit made and not yet sent. */
async function quietWriter(collab: Parameters<typeof peer>[0]) {
  const ada = await peer(collab, 'notes', 'writer');
  ada.announce();
  return { ada, firstEdit: () => ada.change(write('first words')) };
}

describe('a commenter writing under a client id the server did not assign it', () => {
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

  it('is refused for a quiet writer’s id a reader has cleared from presence', async () => {
    const collab = serve();
    const { ada, firstEdit } = await quietWriter(collab);
    const mallory = await peer(collab, 'notes', 'guest');
    const accomplice = await peer(collab, 'notes', 'reader');
    accomplice.announce(ada.doc.clientID, 1000, false);
    await settle();
    const inFlight = firstEdit();

    forge(mallory, ada.doc.clientID, reply('r-forged'));
    ada.send(inFlight);
    await settle();

    expect(mallory.events).toEqual(REFUSED);
    expect(textOf(await held(collab))).toBe('first words');
    await collab.close();
  });

  it('is refused for a quiet writer’s id a reader has repeated and then left with', async () => {
    const collab = serve();
    const { ada, firstEdit } = await quietWriter(collab);
    const mallory = await peer(collab, 'notes', 'guest');
    const accomplice = await peer(collab, 'notes', 'reader');
    accomplice.announce(ada.doc.clientID, 2);
    accomplice.leave();
    await settle();
    const inFlight = firstEdit();

    forge(mallory, ada.doc.clientID, reply('r-forged'));
    ada.send(inFlight);
    await settle();

    expect(mallory.events).toEqual(REFUSED);
    expect(textOf(await held(collab))).toBe('first words');
    await collab.close();
  });

  it('is refused for a quiet writer’s id cleared on another process', async () => {
    const fanout = memoryFanout();
    const persistence = memoryPersistence();
    const one = serve({ fanout, persistence, serverId: 'one' });
    const two = serve({ fanout, persistence, serverId: 'two' });
    const mallory = await peer(two, 'notes', 'guest');
    const { ada, firstEdit } = await quietWriter(one);
    const accomplice = await peer(one, 'notes', 'reader');
    accomplice.announce(ada.doc.clientID, 1000, false);
    await settle();
    const inFlight = firstEdit();

    forge(mallory, ada.doc.clientID, reply('r-forged'));
    ada.send(inFlight);
    await settle();

    expect(mallory.events).toEqual(REFUSED);
    expect(textOf(await held(two))).toBe('first words');
    await Promise.all([one.close(), two.close()]);
  });

  it('is refused for a quiet writer’s id the commenter alone has repeated', async () => {
    const collab = serve();
    const { ada, firstEdit } = await quietWriter(collab);
    const mallory = await peer(collab, 'notes', 'guest');
    mallory.announce(ada.doc.clientID, 1000);
    await settle();
    const inFlight = firstEdit();

    forge(mallory, ada.doc.clientID, reply('r-forged'));
    ada.send(inFlight);
    await settle();

    expect(mallory.events).toEqual(REFUSED);
    expect(textOf(await held(collab))).toBe('first words');
    await collab.close();
  });

  it('is refused for the id assigned to another commenter, before and after it writes', async () => {
    const collab = serve();
    const grace = await peer(collab, 'notes', 'guest');
    const mallory = await peer(collab, 'notes', 'lin');
    await settle();
    const before = grace.change(reply('r-1'));

    forge(mallory, grace.assigned!, reply('r-lin', lin));
    grace.send(before);
    const later = await peer(collab, 'notes', 'lin');
    await settle();
    const inFlight = grace.change(reply('r-2'));
    forge(later, grace.assigned!, reply('r-lin', lin));
    grace.send(inFlight);
    await settle();

    expect(mallory.events).toEqual(REFUSED);
    expect(later.events).toEqual(REFUSED);
    expect(grace.events).toEqual([]);
    expect([...repliesOf(await held(collab)).keys()].sort()).toEqual(['r-1', 'r-2']);
    await collab.close();
  });

  it('is refused from a client that ignores the id it was assigned', async () => {
    const collab = serve();
    const stubborn = await peer(collab, 'notes', 'guest', { adopt: false });
    await settle();

    stubborn.send(stubborn.change(reply('r-1')));
    await settle();

    expect(stubborn.assigned).not.toBe(stubborn.doc.clientID);
    expect(stubborn.events).toEqual(REFUSED);
    expect(repliesOf(await held(collab)).size).toBe(0);
    await collab.close();
  });

  it('is refused when one update writes under its assigned id and another', async () => {
    const collab = serve();
    const grace = await peer(collab, 'notes', 'guest');
    await settle();
    const own = grace.change(reply('r-1'));
    grace.doc.clientID = 7;
    const other = grace.change(reply('r-2'));

    grace.send(Y.mergeUpdates([own, other]));
    await settle();

    expect(grace.events).toEqual(REFUSED);
    expect(repliesOf(await held(collab)).size).toBe(0);
    await collab.close();
  });
});
