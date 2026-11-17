import type * as Y from 'yjs';
import { startedBy } from './authors.ts';

const PREFIX = 'comment:';

const threadOf = (key: string) =>
  key.startsWith(PREFIX) && key.length > PREFIX.length ? key.slice(PREFIX.length) : null;

export type Marks = {
  /** Whether a formatting item the update writes may stand in the text. */
  mayWrite(key: string, value: unknown): boolean;
  /** Whether the text may now show `key` as `value` where it showed something else. */
  mayShow(key: string, value: unknown): boolean;
};

/** The comment marks the subject may add, on threads it started, and remove, also from threads now gone. */
export function marksOf(threads: Y.Map<unknown>, subject: string): Marks {
  const mayAdd = (key: string) => {
    const id = threadOf(key);
    return id !== null && startedBy(threads.get(id), subject);
  };
  const mayRemove = (key: string) => {
    const id = threadOf(key);
    return id !== null && (startedBy(threads.get(id), subject) || !threads.has(id));
  };
  return {
    // Taking a mark off the middle of its range writes `true` again where the range resumes, so an item may say
    // `true` for a thread now gone; what the text shows is judged by `mayShow`.
    mayWrite: (key, value) => (value === true || value === null) && mayRemove(key),
    mayShow: (key, value) => (value === true ? mayAdd(key) : value === null && mayRemove(key)),
  };
}
