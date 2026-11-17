import * as Y from 'yjs';
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

function commentRefusal(events: Events, { threads, replies }: Scratch, subject: string): string | null {
  const threadChanges = keyChangesOf(events.get(threads));
  const replyChanges = keyChangesOf(events.get(replies));
  return (
    threadRefusal(threadChanges, threads, subject) ??
    replyRefusal(replyChanges, replies, subject, deletedThreads(threadChanges))
  );
}

function markRefusal(
  changed: Y.Transaction['changed'],
  events: Events,
  scratch: Scratch,
  subject: string,
): string | null {
  const marks = marksOf(scratch.threads, subject);
  for (const type of changed.keys()) {
    if (!(type instanceof Y.Text)) continue;
    const event = events.get(type);
    // Yjs takes a type deleted in the transaction out of `changed`, so each text here has an event. Fail closed anyway.
    if (!(event instanceof Y.YTextEvent)) return 'changes a text with no event';
    const refusal = textRefusal(event, scratch.before, marks);
    if (refusal !== null) return refusal;
  }
  return null;
}

/** Why what `transaction` changed may not reach the room, or null when every change is one the subject may make. */
export function refusalOf(transaction: Y.Transaction, scratch: Scratch, subject: string): string | null {
  const events = ownEventsOf(transaction);
  return (
    kindRefusal(transaction.changed, scratch) ??
    commentRefusal(events, scratch, subject) ??
    markRefusal(transaction.changed, events, scratch, subject)
  );
}
