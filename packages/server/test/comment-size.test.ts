import { describe, expect, it } from 'vitest';
import type * as Y from 'yjs';
import { copyOf } from './comments/room.ts';
import { guest, reply as storedReply, repliesOf } from './comments/store.ts';
import { held, REFUSED, serve } from './client-ids/setup.ts';
import { peer } from './peer.ts';
import { settle } from './settle.ts';

const replyOf = (id: string, length: number) => (doc: Y.Doc) =>
  repliesOf(doc).set(id, { ...storedReply(id, 't-1', guest), body: 'x'.repeat(length) });

describe('the size of a commenter’s update', () => {
  it('over 64 KiB by default, is refused live with a denial and 4403', async () => {
    const collab = serve();
    const grace = await peer(collab, 'notes', 'guest');
    await settle();

    const update = grace.change(replyOf('r-big', 70_000));
    grace.send(update);
    await settle();

    expect(update.length).toBeGreaterThan(65_536);
    expect(grace.events).toEqual(REFUSED);
    expect(repliesOf(await held(collab)).has('r-big')).toBe(false);
    await collab.close();
  });

  it('over the bound, is ignored as a sync step 2 and the connection kept', async () => {
    const collab = serve();
    const grace = await peer(collab, 'notes', 'guest');
    await settle();

    const aside = copyOf(grace.doc);
    aside.doc.clientID = grace.doc.clientID;
    grace.send(aside.change(replyOf('r-big', 70_000)), 'handshake');
    await settle();
    grace.send(grace.change(replyOf('r-small', 200)));
    await settle();

    const room = await held(collab);
    expect(grace.events).toEqual([]);
    expect(repliesOf(room).has('r-big')).toBe(false);
    expect(repliesOf(room).has('r-small')).toBe(true);
    await collab.close();
  });

  it('well under the bound, lands for an honest comment', async () => {
    const collab = serve();
    const grace = await peer(collab, 'notes', 'guest');
    await settle();

    grace.send(grace.change(replyOf('r-1', 4_000)));
    await settle();

    expect(grace.events).toEqual([]);
    expect(repliesOf(await held(collab)).has('r-1')).toBe(true);
    await collab.close();
  });

  it('is bounded by maxCommentUpdateBytes when given', async () => {
    const collab = serve({ maxCommentUpdateBytes: 1_024 });
    const grace = await peer(collab, 'notes', 'guest');
    const lin = await peer(collab, 'notes', 'guest');
    await settle();

    grace.send(grace.change(replyOf('r-short', 200)));
    lin.send(lin.change(replyOf('r-long', 2_000)));
    await settle();

    const room = await held(collab);
    expect(grace.events).toEqual([]);
    expect(lin.events).toEqual(REFUSED);
    expect(repliesOf(room).has('r-short')).toBe(true);
    expect(repliesOf(room).has('r-long')).toBe(false);
    await collab.close();
  });
});
