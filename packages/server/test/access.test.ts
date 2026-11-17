import { describe, expect, it } from 'vitest';
import { CollabProvider } from 'quoin-collab-client';
import { accessOf } from '../src/access.ts';
import { createCollabServer } from '../src/server.ts';
import { socketsTo } from './fake-socket.ts';
import { settle } from './settle.ts';

const join = (collab: ReturnType<typeof createCollabServer>, room: string, token?: string) =>
  new CollabProvider({ url: 'wss://quoin.test/collab', room, token, socketFactory: socketsTo(collab, room).factory });

describe('accessOf', () => {
  it('is write unless the grant is read only', () => {
    expect(accessOf({})).toBe('write');
    expect(accessOf({ canComment: true })).toBe('write');
  });

  it('is read for a read-only grant', () => {
    expect(accessOf({ readOnly: true })).toBe('read');
  });

  it('is comment only for a read-only grant that may comment', () => {
    expect(accessOf({ readOnly: true, canComment: true })).toBe('comment');
  });
});

describe('a comment connection before the comment rule exists', () => {
  it('receives changes and writes none', async () => {
    const collab = createCollabServer({
      authorize: ({ token }) => (token === 'guest' ? { readOnly: true, canComment: true, subject: 'guest-1' } : {}),
    });
    const writer = join(collab, 'notes', 'writer');
    const guest = join(collab, 'notes', 'guest');
    await settle();

    writer.doc.getText('quoin').insert(0, 'visible');
    await settle();
    expect(guest.doc.getText('quoin').toString()).toBe('visible');

    guest.doc.getText('quoin').insert(0, 'rejected ');
    await settle();
    expect(writer.doc.getText('quoin').toString()).toBe('visible');
    await collab.close();
  });
});
