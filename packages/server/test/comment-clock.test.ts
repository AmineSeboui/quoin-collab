import { describe, expect, it } from 'vitest';
import type * as Y from 'yjs';
import { held, REFUSED, serve } from './client-ids/setup.ts';
import { guest, reply, repliesOf } from './comments/store.ts';
import { peer } from './peer.ts';
import { settle } from './settle.ts';

const MINUTE = 60_000;
const dated = (id: string, offsetMs: number) => (doc: Y.Doc) =>
  repliesOf(doc).set(id, reply(id, 't-1', guest, new Date(Date.now() + offsetMs).toISOString()));

describe('the date of a commenter’s live reply', () => {
  it('backdated by an hour, is refused with a denial and 4403', async () => {
    const collab = serve();
    const grace = await peer(collab, 'notes', 'guest');
    await settle();

    grace.send(grace.change(dated('r-old', -60 * MINUTE)));
    await settle();

    expect(grace.events).toEqual(REFUSED);
    expect(repliesOf(await held(collab)).has('r-old')).toBe(false);
    await collab.close();
  });

  it('dated now, lands', async () => {
    const collab = serve();
    const grace = await peer(collab, 'notes', 'guest');
    await settle();

    grace.send(grace.change(dated('r-now', 0)));
    await settle();

    expect(grace.events).toEqual([]);
    expect(repliesOf(await held(collab)).has('r-now')).toBe(true);
    await collab.close();
  });

  it('2 minutes off is refused under a 1 minute commentClockSkewMs and lands under the default', async () => {
    const strict = serve({ commentClockSkewMs: MINUTE });
    const grace = await peer(strict, 'notes', 'guest');
    await settle();
    grace.send(grace.change(dated('r-skewed', -2 * MINUTE)));
    await settle();
    expect(grace.events).toEqual(REFUSED);
    await strict.close();

    const lax = serve();
    const lin = await peer(lax, 'notes', 'guest');
    await settle();
    lin.send(lin.change(dated('r-skewed', -2 * MINUTE)));
    await settle();
    expect(lin.events).toEqual([]);
    await lax.close();
  });
});
