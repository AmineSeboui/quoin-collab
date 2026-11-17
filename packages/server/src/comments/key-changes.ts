import type * as Y from 'yjs';

export type KeyChanges = ReadonlyMap<string, { action: 'add' | 'update' | 'delete'; oldValue: unknown }>;

export const keyChangesOf = (event: Y.YEvent<Y.Map<unknown>> | undefined): KeyChanges =>
  event?.changes.keys ?? new Map();
