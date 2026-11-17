import { afterEach, describe, expect, it, vi } from 'vitest';
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
  vi.restoreAllMocks();
});

/** An awareness update in which `clientID` says it is here, at `clock`, as a client that has named its user sends. */
function announcement(clientID: number, clock = 1): Uint8Array {
  const doc = new Y.Doc();
  doc.clientID = clientID;
  const awareness = new Awareness(doc);
  for (let at = 0; at < clock; at += 1) awareness.setLocalStateField('user', { name: 'someone', at });
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

  it('stays with the first commenter to announce it, whoever repeats it after', () => {
    const room = open();
    const presence = presenceIn(room);
    const lin = sink();
    const mallory = sink();
    presence.join(lin, 'guest-2');
    presence.join(mallory, 'guest-1');
    room.applyAwareness(announcement(7), lin);

    room.applyAwareness(announcement(7, 2), mallory);
    room.applyAwareness(announcement(7, 3), sink());
    room.applyAwareness(announcement(7, 4), REMOTE);

    expect(presence.announcedByOther(7, 'guest-2')).toBe(false);
    expect(presence.announcedByOther(7, 'guest-1')).toBe(true);
  });

  it('stays with the first connection to announce it, though a commenter repeats it', () => {
    const room = open();
    const presence = presenceIn(room);
    const writer = sink();
    const mallory = sink();
    presence.join(mallory, 'guest-1');
    room.applyAwareness(announcement(7), writer);

    room.applyAwareness(announcement(7, 2), mallory);
    removeAwarenessStates(room.awareness, [7], mallory);

    expect(presence.announcedByOther(7, 'guest-1')).toBe(true);
  });

  it('passes from someone here before the first commenter to the next connection to renew it, not a commenter', () => {
    const room = open();
    const writer = sink();
    const mallory = sink();
    room.applyAwareness(announcement(7), writer);
    const presence = presenceIn(room);
    presence.join(mallory, 'guest-1');

    room.applyAwareness(announcement(7, 2), mallory);
    expect(presence.announcedByOther(7, 'guest-1')).toBe(true);

    room.applyAwareness(announcement(7, 3), writer);
    removeAwarenessStates(room.awareness, [7], sink());
    expect(presence.announcedByOther(7, 'guest-1')).toBe(true);

    room.applyAwareness(announcement(7, 4), writer);
    removeAwarenessStates(room.awareness, [7], writer);
    expect(presence.announcedByOther(7, 'guest-1')).toBe(false);
  });

  it('stays with another process while it renews the id, and lapses once awareness would time it out', () => {
    const room = open();
    const presence = presenceIn(room);
    const start = Date.now();
    const at = (seconds: number) => vi.spyOn(Date, 'now').mockReturnValue(start + seconds * 1000);
    room.applyAwareness(announcement(7), REMOTE);

    at(20);
    room.applyAwareness(announcement(7, 2), REMOTE);
    at(40);
    expect(presence.announcedByOther(7, 'guest-1')).toBe(true);

    at(51);
    expect(presence.announcedByOther(7, 'guest-1')).toBe(false);
  });
});
