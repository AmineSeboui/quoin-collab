import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { presenceIn } from '../../src/client-ids/presence.ts';
import { REMOTE, Room } from '../../src/room.ts';
import type { SocketSink } from '../../src/transport.ts';

const sink = (): SocketSink => ({ send: () => undefined, close: () => undefined });

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

/** An awareness update in which `clientID` says it is here, as a client that has named its user sends one. */
function announcement(clientID: number): Uint8Array {
  const doc = new Y.Doc();
  doc.clientID = clientID;
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', { name: 'someone' });
  const update = encodeAwarenessUpdate(awareness, [clientID]);
  awareness.destroy();
  return update;
}

describe('who has announced a client id', () => {
  it('is another connection, for an id a reader announced while it holds it', () => {
    const room = open();
    const presence = presenceIn(room);
    const reader = sink();

    room.applyAwareness(announcement(7), reader);

    expect(presence.announcedByOther(7, 'guest-1')).toBe(true);
  });

  it('is nobody, once the reader takes it back or its presence times out', () => {
    const room = open();
    const presence = presenceIn(room);
    const leaving = sink();
    const idle = sink();
    room.applyAwareness(announcement(7), leaving);
    room.applyAwareness(announcement(8), idle);

    removeAwarenessStates(room.awareness, [7], leaving);
    removeAwarenessStates(room.awareness, [8], 'timeout');

    expect(presence.announcedByOther(7, 'guest-1')).toBe(false);
    expect(presence.announcedByOther(8, 'guest-1')).toBe(false);
  });

  it('is still the reader, when someone else removes the id it announced', () => {
    const room = open();
    const presence = presenceIn(room);
    const reader = sink();
    const mallory = sink();
    presence.join(mallory, 'guest-2');
    room.applyAwareness(announcement(7), reader);

    removeAwarenessStates(room.awareness, [7], mallory);

    expect(presence.announcedByOther(7, 'guest-2')).toBe(true);
  });

  it('is the commenter’s own subject, on any of its connections, and another for anyone else', () => {
    const room = open();
    const presence = presenceIn(room);
    const before = sink();
    presence.join(before, 'guest-1');
    room.applyAwareness(announcement(7), before);
    removeAwarenessStates(room.awareness, [7], before);
    presence.leave(before);

    expect(presence.announcedByOther(7, 'guest-1')).toBe(false);
    expect(presence.announcedByOther(7, 'guest-2')).toBe(true);
  });

  it('is another process, for an id announced through the fanout until it is taken back', () => {
    const room = open();
    const presence = presenceIn(room);

    room.applyAwareness(announcement(7), REMOTE);
    expect(presence.announcedByOther(7, 'guest-1')).toBe(true);

    removeAwarenessStates(room.awareness, [7], REMOTE);
    expect(presence.announcedByOther(7, 'guest-1')).toBe(false);
  });
});
