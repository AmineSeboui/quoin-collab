import * as Y from 'yjs';
import type { CommentClock } from './clock.ts';
import { keyChangesOf } from './key-changes.ts';
import { marksOf } from './marks.ts';
import { replyRefusal } from './reply-effect.ts';
import type { Scratch } from './scratch.ts';
import { textRefusal } from './text-effect.ts';
import { deletedThreads, threadRefusal } from './thread-effect.ts';

const ownEventsOf = (transaction: Y.Transaction) =>
  new Map(
    [...transaction.changedParentTypes].map(([type, events]) => [
      type as unknown,
      events.find((event) => event.target === type),
    ]),
  );

type Events = ReturnType<typeof ownEventsOf>;

const isCommentMap = (type: unknown, { threads, replies }: Scratch) => type === threads || type === replies;

function kindRefusal(changed: Y.Transaction['changed'], scratch: Scratch): string | null {
  for (const [type, keys] of changed) {
    if (isCommentMap(type, scratch)) {
      if (keys.has(null)) return 'puts a list item in a comment map';
    } else if (!(type instanceof Y.Text)) {
      return type.parent === null ? 'adds a root type' : 'changes an embedded type';
    } else if ([...keys].some((key) => key !== null)) {
      return 'sets a key outside the comment maps';
    }
  }
  return null;
}

function commentRefusal(
  events: Events,
  { threads, replies, threadIds }: Scratch,
  subject: string,
  clock: CommentClock,
): string | null {
  const threadChanges = keyChangesOf(events.get(threads));
  const replyChanges = keyChangesOf(events.get(replies));
  return (
    threadRefusal(threadChanges, threads, threadIds, subject, clock) ??
    replyRefusal(replyChanges, replies, subject, deletedThreads(threadChanges), clock)
  );
}

function markRefusal(changed: Y.Transaction['changed'], scratch: Scratch, subject: string): string | null {
  const marks = marksOf(scratch.threads, subject);
  for (const type of changed.keys()) {
    const refusal = type instanceof Y.Text ? textRefusal(type, scratch.before, marks) : null;
    if (refusal !== null) return refusal;
  }
  return null;
}

/** Why what `transaction` changed may not reach the room, or null when every change is one the subject may make. */
export const refusalOf = (
  transaction: Y.Transaction,
  scratch: Scratch,
  subject: string,
  clock: CommentClock,
): string | null =>
  kindRefusal(transaction.changed, scratch) ??
  commentRefusal(ownEventsOf(transaction), scratch, subject, clock) ??
  markRefusal(transaction.changed, scratch, subject);
