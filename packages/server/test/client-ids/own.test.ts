import { describe, expect, it } from 'vitest';
import { memoryFanout } from '../../src/fanout/memory.ts';
import { memoryPersistence } from '../../src/persistence/memory.ts';
import { MESSAGE_CLIENT_ID, MESSAGE_SYNC } from '../../src/protocol/index.ts';
import { guest, repliesOf, replyTo } from '../comments/store.ts';
import { peer } from '../peer.ts';
import { settle } from '../settle.ts';
import { commenter, held, serve, textOf } from './setup.ts';

const comment = (client: ReturnType<typeof commenter>, id: string) => replyTo(client.provider.doc, 't-1', id, guest);

describe('a commenter writing under the client id the server assigned it', () => {
  it('lands, through quoin-collab-client, under that id rather than the document’s own', async () => {
    const collab = serve();
    const grace = commenter(collab);
    const original = grace.provider.doc.clientID;
    await settle();

    comment(grace, 'r-1');
    await settle();

    expect(grace.denied).toEqual([]);
    expect(grace.provider.doc.clientID).not.toBe(original);
    expect(repliesOf(await held(collab)).has('r-1')).toBe(true);
    await collab.close();
  });

  it('lands after a reconnect to the same room, under a new id', async () => {
    const collab = serve();
    const ada = await peer(collab, 'notes', 'writer');
    const grace = commenter(collab);
    await settle();
    comment(grace, 'r-1');
    await settle();
    const first = grace.provider.doc.clientID;

    grace.provider.disconnect();
    grace.provider.connect();
    await settle();
    comment(grace, 'r-2');
    await settle();

    expect(grace.denied).toEqual([]);
    expect(grace.provider.doc.clientID).not.toBe(first);
    expect([...repliesOf(ada.doc).keys()].sort()).toEqual(['r-1', 'r-2']);
    await collab.close();
  });

  it('lands after a reconnect to a room freshly loaded from storage', async () => {
    const persistence = memoryPersistence();
    const one = serve({ persistence });
    const grace = commenter(one);
    await settle();
    comment(grace, 'r-1');
    await settle();
    grace.provider.disconnect();
    await one.close();

    const two = serve({ persistence });
    grace.moveTo(two);
    grace.provider.connect();
    await settle();
    comment(grace, 'r-2');
    await settle();

    expect(grace.denied).toEqual([]);
    expect([...repliesOf(await held(two)).keys()].sort()).toEqual(['r-1', 'r-2']);
    await two.close();
  });

  it('lands after a reconnect to another process serving the room', async () => {
    const fanout = memoryFanout();
    const persistence = memoryPersistence();
    const one = serve({ fanout, persistence, serverId: 'one' });
    const two = serve({ fanout, persistence, serverId: 'two' });
    const ada = await peer(two, 'notes', 'writer');
    const grace = commenter(one);
    await settle();
    comment(grace, 'r-1');
    await settle();

    grace.provider.disconnect();
    grace.moveTo(two);
    grace.provider.connect();
    await settle();
    comment(grace, 'r-2');
    await settle();

    expect(grace.denied).toEqual([]);
    expect([...repliesOf(ada.doc).keys()].sort()).toEqual(['r-1', 'r-2']);
    await Promise.all([one.close(), two.close()]);
  });

  it('lands for a writer who may now only comment, on the same page', async () => {
    const collab = serve();
    const grace = commenter(collab, 'writer');
    await settle();
    grace.provider.doc.getText('quoin').insert(0, 'written as an editor');
    await settle();

    grace.provider.disconnect();
    grace.grant('guest');
    grace.provider.connect();
    await settle();
    comment(grace, 'r-1');
    await settle();

    const room = await held(collab);
    expect(grace.denied).toEqual([]);
    expect(textOf(room)).toBe('written as an editor');
    expect(repliesOf(room).has('r-1')).toBe(true);
    await collab.close();
  });

  it('lands for a reader who may now comment, on the same page', async () => {
    const collab = serve();
    const grace = commenter(collab, 'reader-grace');
    await settle();

    grace.provider.disconnect();
    grace.grant('guest');
    grace.provider.connect();
    await settle();
    comment(grace, 'r-1');
    await settle();

    expect(grace.denied).toEqual([]);
    expect(repliesOf(await held(collab)).has('r-1')).toBe(true);
    await collab.close();
  });

  it('is reported as refused when the room lost an earlier comment, and sends nothing more', async () => {
    const forgetful = { load: async () => null, save: async () => undefined };
    const one = serve({ persistence: forgetful });
    const grace = commenter(one);
    await settle();
    comment(grace, 'r-1');
    await settle();
    grace.provider.disconnect();
    await one.close();

    const two = serve({ persistence: forgetful });
    grace.moveTo(two);
    grace.provider.connect();
    await settle();
    comment(grace, 'r-2');
    await settle();

    expect(grace.denied).toEqual(['refused']);
    expect(grace.provider.synced).toBe(false);
    expect(repliesOf(await held(two)).size).toBe(0);
    await two.close();
  });
});

describe('the client id frame', () => {
  it('reaches a commenter first, before its sync step 1, and never a writer or a reader', async () => {
    const collab = serve();
    const grace = await peer(collab, 'notes', 'guest');
    const ada = await peer(collab, 'notes', 'writer');
    const reader = await peer(collab, 'notes', 'reader');
    await settle();

    expect(grace.frames.slice(0, 2)).toEqual([MESSAGE_CLIENT_ID, MESSAGE_SYNC]);
    expect(grace.assigned).not.toBeNull();
    expect(ada.frames).not.toContain(MESSAGE_CLIENT_ID);
    expect(reader.frames).not.toContain(MESSAGE_CLIENT_ID);
    await collab.close();
  });
});
