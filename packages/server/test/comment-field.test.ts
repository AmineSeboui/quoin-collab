import { describe, expect, it } from 'vitest';
import { createCollabServer } from '../src/server.ts';
import { REFUSED_CODE, REFUSED_REASON } from '../src/refusal.ts';
import { guest, startThread, threadsOf } from './comments/store.ts';
import { peer } from './peer.ts';
import { settle } from './settle.ts';

const authorize = ({ token }: { token: string | null }) =>
  token === 'guest' ? { readOnly: true, canComment: true, subject: guest.id } : {};

describe('commentField', () => {
  it('judges threads under the named field and refuses the default one', async () => {
    const collab = createCollabServer({ authorize, commentField: 'notes' });
    const grace = await peer(collab, 'doc', 'guest');
    const reader = await peer(collab, 'doc', 'reader');
    await settle();

    grace.send(grace.change((doc) => startThread(doc, 't-1', guest, 'notes')));
    await settle();
    expect(threadsOf(reader.doc, 'notes').has('t-1')).toBe(true);
    expect(grace.events).toEqual([]);

    grace.send(grace.change((doc) => startThread(doc, 't-2', guest)));
    await settle();
    expect(threadsOf(reader.doc).has('t-2')).toBe(false);
    expect(grace.events).toContain(`closed:${REFUSED_CODE}:${REFUSED_REASON}`);
  });
});
