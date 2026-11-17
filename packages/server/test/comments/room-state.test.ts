import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { HELLO, changeOn, copyOf, judge, refused, roomWith, textOf } from './room.ts';
import { deleteThread, guest, member, resolveThread, startThread } from './store.ts';

describe('judging against what the room holds', () => {
  it('an update that depends on changes the room lacks', () => {
    const doc = roomWith();
    const client = copyOf(doc);
    client.change((copy) => startThread(copy, 't-guest', guest));
    const resolve = client.change((copy) => resolveThread(copy, 't-guest'));
    const remove = client.change((copy) => deleteThread(copy, 't-guest'));
    expect(judge(doc, resolve)).toEqual(refused('needs changes the room lacks'));
    expect(judge(doc, remove)).toEqual(refused('needs changes the room lacks'));
  });

  it('an update that cannot be read', () => {
    const doc = roomWith();
    const update = changeOn(doc, (copy) => startThread(copy, 't-guest', guest));
    expect(judge(doc, update.slice(0, update.length - 4))).toEqual(refused('cannot be read'));
  });

  it("judging never changes the room's document", () => {
    const doc = roomWith((d) => startThread(d, 't-member', member));
    const vector = Y.encodeStateVector(doc);
    const state = Y.encodeStateAsUpdate(doc);

    const client = copyOf(doc);
    client.change((copy) => startThread(copy, 't-guest', guest));
    expect(judge(doc, client.change((copy) => resolveThread(copy, 't-guest'))).ok).toBe(false);
    expect(judge(doc, changeOn(doc, (copy) => textOf(copy).insert(HELLO, 'oh '))).ok).toBe(false);
    expect(judge(doc, changeOn(doc, (copy) => startThread(copy, 't-guest', guest))).ok).toBe(true);

    expect(Y.encodeStateVector(doc)).toEqual(vector);
    expect(Y.encodeStateAsUpdate(doc)).toEqual(state);
  });
});
