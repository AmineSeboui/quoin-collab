import { describe, expect, it } from 'vitest';
import { guest, repliesOf, replyTo, startThread, threadsOf } from '../comments/store.ts';
import { settle } from '../settle.ts';
import { commenter, held, serve, textOf } from './setup.ts';

/** Longer than the first reconnect delay after a synced connection, which is 75 to 150 milliseconds. */
const reconnected = async () => {
  await new Promise((resolve) => setTimeout(resolve, 250));
  await settle();
};

describe('a change lost on a socket that died without a close', () => {
  it('is reported as refused to a commenter once the provider reconnects, and nothing after it is sent', async () => {
    const collab = serve();
    const grace = commenter(collab);
    await settle();

    grace.socket().sever();
    startThread(grace.provider.doc, 't-1', guest);
    await settle();
    expect(grace.provider.synced).toBe(true);
    grace.socket().close();
    await reconnected();
    replyTo(grace.provider.doc, 't-1', 'r-1', guest);
    await settle();

    const room = await held(collab);
    expect(grace.denied).toEqual(['refused']);
    expect(grace.provider.synced).toBe(false);
    expect(threadsOf(room).has('t-1')).toBe(false);
    expect(repliesOf(room).size).toBe(0);
    await collab.close();
  });

  it('reaches the room from a writer, never assigned an id, in the sync step 2 of its reconnect', async () => {
    const collab = serve();
    const ada = commenter(collab, 'writer');
    await settle();

    ada.socket().sever();
    ada.provider.doc.getText('quoin').insert(0, 'kept');
    await settle();
    ada.socket().close();
    await reconnected();

    expect(ada.denied).toEqual([]);
    expect(ada.provider.synced).toBe(true);
    expect(textOf(await held(collab))).toBe('kept');
    await collab.close();
  });
});
