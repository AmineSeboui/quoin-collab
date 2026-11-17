import type * as Y from 'yjs';
import { HELLO, SUBJECT, textOf } from './room.ts';

export type User = { id: string; name: string; avatarUrl?: string };

export const guest: User = { id: SUBJECT, name: 'Grace' };
export const member: User = { id: 'member-1', name: 'Ada' };

const CREATED = '2026-11-17T09:00:00.000Z';

type Stored = Record<string, unknown>;

export const threadsOf = (doc: Y.Doc, field = 'comment') => doc.getMap<unknown>(`${field}-threads`);
export const repliesOf = (doc: Y.Doc, field = 'comment') => doc.getMap<unknown>(`${field}-replies`);

/** A thread's value as `yjsCommentThreads` writes it; one written before 2.5.0 has no `startedBy`. */
export const thread = (id: string, startedBy?: User): Stored => ({
  id,
  resolved: false,
  createdAt: CREATED,
  ...(startedBy && { startedBy }),
});

export const reply = (id: string, threadId: string, author: User): Stored => ({
  id,
  threadId,
  author,
  body: 'Agreed.',
  createdAt: CREATED,
});

export const startThread = (doc: Y.Doc, id: string, user: User | undefined, field?: string) =>
  threadsOf(doc, field).set(id, thread(id, user));

export const replyTo = (doc: Y.Doc, threadId: string, id: string, user: User) =>
  repliesOf(doc).set(id, reply(id, threadId, user));

export const resolveThread = (doc: Y.Doc, id: string) =>
  threadsOf(doc).set(id, { ...(threadsOf(doc).get(id) as Stored), resolved: true });

export function deleteThread(doc: Y.Doc, id: string): void {
  threadsOf(doc).delete(id);
  for (const comment of [...repliesOf(doc).values()] as Stored[]) {
    if (comment.threadId === id) repliesOf(doc).delete(comment.id as string);
  }
}

export const markThread = (doc: Y.Doc, id: string, value: unknown = true) =>
  textOf(doc).format(HELLO, 5, { [`comment:${id}`]: value });

export const unmarkThread = (doc: Y.Doc, id: string) => markThread(doc, id, null);
