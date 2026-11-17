import { isRecord } from './json.ts';

// An empty subject names nobody, so a token without one owns no comment.
const names = (user: unknown, subject: string): user is Record<string, unknown> =>
  subject !== '' && isRecord(user) && user.id === subject;

/** Whether `user` is the subject as the store writes a user, with no avatar address for every reader to load. */
export const isSubject = (user: unknown, subject: string): boolean =>
  names(user, subject) && typeof user.name === 'string' && user.avatarUrl === undefined;

export const startedBy = (thread: unknown, subject: string): thread is Record<string, unknown> =>
  isRecord(thread) && names(thread.startedBy, subject);
