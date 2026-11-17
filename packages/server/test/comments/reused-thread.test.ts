import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { ALLOWED, changeOn, judge, refused, roomWith } from './room.ts';
import { deleteThread, guest, member, reply, repliesOf, replyTo, startThread, threadsOf } from './store.ts';

const BROUGHT_BACK = refused('brings back a deleted thread');

describe('a thread id the room has held before', () => {
  it('is refused when the subject starts her own deleted thread again', () => {
    const doc = roomWith((d) => startThread(d, 't-1', guest), (d) => deleteThread(d, 't-1'));
    expect(judge(doc, changeOn(doc, (copy) => startThread(copy, 't-1', guest)))).toEqual(BROUGHT_BACK);
  });

  it("is refused when the subject starts a member's deleted thread as her own", () => {
    const doc = roomWith((d) => startThread(d, 't-member', member), (d) => deleteThread(d, 't-member'));
    expect(judge(doc, changeOn(doc, (copy) => startThread(copy, 't-member', guest)))).toEqual(BROUGHT_BACK);
  });

  it("is refused when it would put a member's answer under a backdated question", () => {
    const doc = roomWith((d) => {
      startThread(d, 't-1', guest);
      repliesOf(d).set('r-1', { ...reply('r-1', 't-1', guest), body: 'May I share this document publicly?' });
      repliesOf(d).set('r-2', { ...reply('r-2', 't-1', member), body: 'Yes, go ahead.' });
    });
    const withdrawn = changeOn(doc, (copy) => {
      threadsOf(copy).delete('t-1');
      repliesOf(copy).delete('r-1');
    });
    expect(judge(doc, withdrawn)).toEqual(ALLOWED);
    Y.applyUpdate(doc, withdrawn);

    const reworded = changeOn(doc, (copy) => {
      startThread(copy, 't-1', guest);
      repliesOf(copy).set('r-0', {
        ...reply('r-0', 't-1', guest),
        body: 'May I delete every page of this document?',
        createdAt: '2026-11-17T08:59:00.000Z',
      });
    });
    expect(judge(doc, reworded)).toEqual(BROUGHT_BACK);
  });

  it('leaves a reply to a deleted thread allowed, which no reader shows', () => {
    const doc = roomWith((d) => startThread(d, 't-1', guest), (d) => deleteThread(d, 't-1'));
    expect(judge(doc, changeOn(doc, (copy) => replyTo(copy, 't-1', 'r-late', guest)))).toEqual(ALLOWED);
  });
});
