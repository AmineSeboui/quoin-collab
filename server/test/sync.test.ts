import { describe, expect, it } from 'vitest';
import { CollabProvider } from 'quoin-collab-client';
import { createCollabServer } from '../src/server.ts';
import { socketsTo } from './fake-socket.ts';
import { settle } from './settle.ts';

const join = (collab: ReturnType<typeof createCollabServer>, room: string, token?: string) =>
  new CollabProvider({ url: 'wss://quoin.test/collab', room, token, socketFactory: socketsTo(collab, room).factory });

describe('a room served to two clients', () => {
  it('carries what one of them types to the other', async () => {
    const collab = createCollabServer();
    const ada = join(collab, 'notes');
    const grace = join(collab, 'notes');
    await settle();

    ada.doc.getText('quoin').insert(0, 'hello');
    await settle();

    expect(grace.doc.getText('quoin').toString()).toBe('hello');
    expect(ada.synced).toBe(true);
    expect(grace.synced).toBe(true);
    await collab.close();
  });

  it('merges edits the two make at the same moment', async () => {
    const collab = createCollabServer();
    const ada = join(collab, 'notes');
    const grace = join(collab, 'notes');
    await settle();
    ada.doc.getText('quoin').insert(0, 'abc');
    await settle();

    ada.doc.getText('quoin').insert(3, 'X');
    grace.doc.getText('quoin').insert(0, 'Y');
    await settle();

    expect(grace.doc.getText('quoin').toString()).toBe(ada.doc.getText('quoin').toString());
    expect(ada.doc.getText('quoin').toString()).toHaveLength(5);
    await collab.close();
  });

  it('shows each of them who else is here', async () => {
    const collab = createCollabServer();
    const ada = join(collab, 'notes');
    const grace = join(collab, 'notes');
    await settle();

    ada.awareness.setLocalStateField('user', { name: 'Ada' });
    grace.awareness.setLocalStateField('user', { name: 'Grace' });
    await settle();

    const seenByGrace = [...grace.awareness.getStates().values()].map((state) => (state as { user?: { name: string } }).user?.name);
    expect(seenByGrace.sort()).toEqual(['Ada', 'Grace']);
    await collab.close();
  });

  it('takes a collaborator’s caret away when their socket closes', async () => {
    const collab = createCollabServer();
    const ada = join(collab, 'notes');
    const grace = join(collab, 'notes');
    await settle();
    ada.awareness.setLocalStateField('user', { name: 'Ada' });
    grace.awareness.setLocalStateField('user', { name: 'Grace' });
    await settle();

    grace.destroy();
    await settle();

    expect([...ada.awareness.getStates().keys()]).toEqual([ada.doc.clientID]);
    await collab.close();
  });

  it('keeps two rooms apart', async () => {
    const collab = createCollabServer();
    const ada = join(collab, 'one');
    const grace = join(collab, 'two');
    await settle();

    ada.doc.getText('quoin').insert(0, 'private');
    await settle();

    expect(grace.doc.getText('quoin').toString()).toBe('');
    await collab.close();
  });
});

describe('a read-only client', () => {
  it('receives changes but writes none', async () => {
    const collab = createCollabServer({ authorize: ({ token }) => ({ readOnly: token === 'reader' }) });
    const writer = join(collab, 'notes', 'writer');
    const reader = join(collab, 'notes', 'reader');
    await settle();

    writer.doc.getText('quoin').insert(0, 'visible');
    await settle();
    expect(reader.doc.getText('quoin').toString()).toBe('visible');

    reader.doc.getText('quoin').insert(0, 'rejected ');
    await settle();

    expect(writer.doc.getText('quoin').toString()).toBe('visible');
    await collab.close();
  });
});

describe('a client the server turns away', () => {
  it('is told why rather than left guessing', async () => {
    const collab = createCollabServer({ authorize: () => null });
    const denied: string[] = [];
    const provider = join(collab, 'notes', 'nope');
    provider.on('denied', (reason) => denied.push(reason));
    await settle();

    expect(denied).toHaveLength(1);
    expect(denied[0]).toContain('not open to you');
    expect(provider.synced).toBe(false);
    await collab.close();
  });

  it('passes on the reason the authorizer gave, when it gave one', async () => {
    const collab = createCollabServer({ authorize: () => ({ denied: 'This project is at its document limit.' }) });
    const denied: string[] = [];
    const provider = join(collab, 'notes', 'over-the-limit');
    provider.on('denied', (reason) => denied.push(reason));
    await settle();

    expect(denied).toEqual(['This project is at its document limit.']);
    expect(provider.synced).toBe(false);
    expect(collab.stats().rooms).toBe(0);
    await collab.close();
  });
});
