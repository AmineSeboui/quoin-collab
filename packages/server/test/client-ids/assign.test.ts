import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { assignClientId } from '../../src/client-ids/assign.ts';
import { Room } from '../../src/room.ts';
import { textOf, write } from './setup.ts';

const rooms: Room[] = [];
const open = () => {
  const nothing = () => undefined;
  const room = new Room('notes', { onLocalUpdate: nothing, onLocalAwareness: nothing, onEmpty: nothing });
  rooms.push(room);
  return room;
};

afterEach(() => {
  for (const room of rooms.splice(0)) room.destroy();
});

/** A random source that answers `ids` in turn. */
const scripted = (...ids: number[]) => () => ids.shift()!;

describe('the client id assigned to a comment-only connection', () => {
  it('is none the room has structs under, none its awareness has seen, and none another connection holds', () => {
    const room = open();
    const writer = new Y.Doc();
    writer.clientID = 11;
    write('hello')(writer);
    room.applyUpdate(Y.encodeStateAsUpdate(writer), null);
    room.awareness.meta.set(12, { clock: 1, lastUpdated: Date.now() });
    const held = assignClientId(room, scripted(13));

    const assigned = assignClientId(room, scripted(11, 12, 13, 14));

    expect(textOf(room.doc)).toBe('hello');
    expect([held.clientID, assigned.clientID]).toEqual([13, 14]);
  });

  it('is free for another connection once its own has ended', () => {
    const room = open();
    const first = assignClientId(room, scripted(13));

    first.release();

    expect(assignClientId(room, scripted(13)).clientID).toBe(13);
  });
});
