import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Y from 'yjs';
import { CollabProvider } from 'quoin-collab-client';
import type { Authorization } from '../src/auth.ts';
import { judgeCommentUpdate } from '../src/comments/judge.ts';
import type { MeterEvent } from '../src/meter.ts';
import { MESSAGE_CLIENT_ID } from '../src/protocol/index.ts';
import { REFUSED_CODE, REFUSED_REASON } from '../src/refusal.ts';
import { createCollabServer, type CollabServer } from '../src/server.ts';
import { copyOf } from './comments/room.ts';
import { guest, repliesOf, replyTo } from './comments/store.ts';
import { socketsTo } from './fake-socket.ts';
import { peer } from './peer.ts';
import { settle } from './settle.ts';

vi.mock('../src/comments/judge.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/comments/judge.ts')>();
  return { ...actual, judgeCommentUpdate: vi.fn(actual.judgeCommentUpdate) };
});

const GRANTS: Record<string, Authorization> = {
  writer: {},
  reader: { readOnly: true },
  guest: { readOnly: true, canComment: true, subject: guest.id },
  nobody: { readOnly: true, canComment: true },
  'empty-subject': { readOnly: true, canComment: true, subject: '' },
};

const textOf = (doc: Y.Doc) => doc.getText('quoin').toString();
const insertText = (doc: Y.Doc) => doc.getText('quoin').insert(0, 'not yours ');
const reply = (id: string) => (doc: Y.Doc) => replyTo(doc, 't-1', id, guest);

/** A copy of `doc` writing under `doc`'s client id, for a second change the first does not depend on. */
const beside = (doc: Y.Doc) => {
  const copy = copyOf(doc);
  copy.doc.clientID = doc.clientID;
  return copy;
};

const join = (collab: CollabServer, token: string, socketFactory = socketsTo(collab, 'notes').factory) =>
  new CollabProvider({ url: 'wss://quoin.test/c', room: 'notes', token, socketFactory });

/** A room holding `hello world`, with a member connected to watch what reaches the other sockets. */
async function room() {
  const meter: MeterEvent[] = [];
  const collab = createCollabServer({
    authorize: ({ token }) => GRANTS[token ?? ''] ?? null,
    meter: { record: (event) => void meter.push(event) },
  });
  const member = join(collab, 'writer');
  await settle();
  member.doc.getText('quoin').insert(0, 'hello world');
  await settle();
  /** What the room holds, read by someone who joins after the fact. */
  const held = async () => {
    const reader = await peer(collab, 'notes', 'reader');
    await settle();
    return reader.doc;
  };
  const refusals = () => meter.filter((event) => event.kind === 'update.refused');
  return { collab, member, meter, held, refusals };
}

beforeEach(() => {
  vi.mocked(judgeCommentUpdate).mockClear();
});

describe('a comment-only connection', () => {
  it('a commenter’s allowed update reaches the room and the other sockets', async () => {
    const { collab, member, held } = await room();
    const grace = await peer(collab, 'notes', 'guest');
    await settle();

    grace.send(grace.change(reply('r-1')));
    await settle();

    expect(grace.events).toEqual([]);
    expect(repliesOf(member.doc).has('r-1')).toBe(true);
    expect(repliesOf(await held()).has('r-1')).toBe(true);
    await collab.close();
  });

  it('a commenter’s refused update is denied and the socket closes with 4403', async () => {
    const { collab, member, held, refusals } = await room();
    const grace = await peer(collab, 'notes', 'guest');
    await settle();
    const later = beside(grace.doc).change(reply('r-after'));

    grace.send(grace.change(insertText));
    grace.send(later);
    await settle();

    expect([REFUSED_REASON, REFUSED_CODE]).toEqual(['refused', 4403]);
    expect(grace.events).toEqual(['denied:refused', 'closed:4403:refused']);
    expect(textOf(member.doc)).toBe('hello world');
    const stored = await held();
    expect(textOf(stored)).toBe('hello world');
    expect(repliesOf(stored).has('r-after')).toBe(false);
    expect(refusals()).toEqual([{ kind: 'update.refused', room: 'notes', origin: 'live' }]);
    await collab.close();
  });

  it('a commenter’s refused sync step 2 is ignored and the socket stays open', async () => {
    const { collab, member, held, refusals } = await room();
    const grace = await peer(collab, 'notes', 'guest');
    await settle();

    grace.send(beside(grace.doc).change(insertText), 'handshake');
    await settle();
    expect(textOf(await held())).toBe('hello world');

    grace.send(grace.change(reply('r-1')));
    await settle();

    expect(grace.events).toEqual([]);
    expect(textOf(member.doc)).toBe('hello world');
    expect(repliesOf(member.doc).has('r-1')).toBe(true);
    expect(refusals()).toEqual([{ kind: 'update.refused', room: 'notes', origin: 'handshake' }]);
    await collab.close();
  });

  it('a reader’s updates are still dropped silently', async () => {
    const { collab, member, held, refusals } = await room();
    const reader = await peer(collab, 'notes', 'reader');
    await settle();

    reader.send(copyOf(reader.doc).change(insertText), 'handshake');
    reader.send(reader.change(insertText));
    await settle();

    expect(reader.events).toEqual([]);
    expect(textOf(member.doc)).toBe('hello world');
    expect(textOf(await held())).toBe('hello world');
    expect(refusals()).toEqual([]);
    expect(judgeCommentUpdate).not.toHaveBeenCalled();
    await collab.close();
  });

  it.each(['nobody', 'empty-subject'])('a comment grant naming no subject is served as a reader (%s)', async (token) => {
    const { collab, member, held, refusals } = await room();
    const nobody = await peer(collab, 'notes', token);
    await settle();

    nobody.send(nobody.change(reply('r-1')));
    await settle();

    expect(nobody.frames).not.toContain(MESSAGE_CLIENT_ID);
    expect(nobody.events).toEqual([]);
    expect(repliesOf(member.doc).has('r-1')).toBe(false);
    expect(repliesOf(await held()).has('r-1')).toBe(false);
    expect(refusals()).toEqual([]);
    expect(judgeCommentUpdate).not.toHaveBeenCalled();
    await collab.close();
  });

  it('a writer’s update takes the same path as before', async () => {
    const { collab, member, meter } = await room();
    const writer = await peer(collab, 'notes', 'writer');
    await settle();

    const update = writer.change(insertText);
    writer.send(update);
    await settle();

    expect(writer.events).toEqual([]);
    expect(textOf(member.doc)).toBe('not yours hello world');
    expect(meter).toContainEqual({ kind: 'update.applied', room: 'notes', bytes: update.length, origin: 'client' });
    expect(judgeCommentUpdate).not.toHaveBeenCalled();
    await collab.close();
  });
});

describe('a commenter’s client', () => {
  it('stops reconnecting after a refusal and reports denied with reason refused', async () => {
    const { collab } = await room();
    const sockets = socketsTo(collab, 'notes');
    const grace = join(collab, 'guest', sockets.factory);
    const denied: string[] = [];
    grace.on('denied', (reason) => denied.push(reason));
    await settle();
    expect(grace.synced).toBe(true);

    insertText(grace.doc);
    // Longer than the first reconnect delay, which a close after a synced connection would have waited.
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(denied).toEqual(['refused']);
    expect(sockets.opened).toHaveLength(1);
    expect(grace.status).toBe('offline');
    grace.destroy();
    await collab.close();
  });
});
