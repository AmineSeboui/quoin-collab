import { describe, expect, it } from 'vitest';
import * as decoding from 'lib0/decoding';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { applyAwarenessUpdate } from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import {
  MESSAGE_AUTH,
  MESSAGE_AWARENESS,
  MESSAGE_QUERY_AWARENESS,
  MESSAGE_SYNC,
  awarenessFrame,
  deniedFrame,
  queryAwarenessFrame,
  readDenial,
  readFrame,
  syncStep1,
  syncStep2,
  syncUpdate,
} from '../src/protocol/index.ts';

describe('frame tags', () => {
  it('match the numbers y-websocket uses, so either side can be swapped out', () => {
    expect([MESSAGE_SYNC, MESSAGE_AWARENESS, MESSAGE_AUTH, MESSAGE_QUERY_AWARENESS]).toEqual([0, 1, 2, 3]);
  });

  it('lead every frame this module builds', () => {
    const doc = new Y.Doc();
    expect(readFrame(syncStep1(doc)).type).toBe(MESSAGE_SYNC);
    expect(readFrame(syncStep2(doc)).type).toBe(MESSAGE_SYNC);
    expect(readFrame(syncUpdate(Y.encodeStateAsUpdate(doc))).type).toBe(MESSAGE_SYNC);
    expect(readFrame(queryAwarenessFrame()).type).toBe(MESSAGE_QUERY_AWARENESS);
    expect(readFrame(deniedFrame('no')).type).toBe(MESSAGE_AUTH);
  });
});

describe('a sync frame', () => {
  it('brings a second document up to date with the first', () => {
    const source = new Y.Doc();
    source.getText('quoin').insert(0, 'shared');
    const target = new Y.Doc();

    const { decoder } = readFrame(syncStep1(target));
    expect(decoding.readVarUint(decoder)).toBe(syncProtocol.messageYjsSyncStep1);
    const answer = syncStep2(source, decoding.readVarUint8Array(decoder));

    const reply = readFrame(answer);
    decoding.readVarUint(reply.decoder);
    Y.applyUpdate(target, decoding.readVarUint8Array(reply.decoder));

    expect(target.getText('quoin').toString()).toBe('shared');
  });
});

describe('an awareness frame', () => {
  it('carries a person to another client', () => {
    const here = new Y.Doc();
    const mine = new Awareness(here);
    mine.setLocalStateField('user', { name: 'Ada' });
    const theirs = new Awareness(new Y.Doc());

    const { decoder } = readFrame(awarenessFrame(mine, [here.clientID]));
    applyAwarenessUpdate(theirs, decoding.readVarUint8Array(decoder), 'test');

    expect((theirs.getStates().get(here.clientID) as { user: { name: string } }).user.name).toBe('Ada');
  });
});

describe('a denial frame', () => {
  it('says why', () => {
    const { decoder } = readFrame(deniedFrame('this room is closed'));
    expect(readDenial(decoder)).toBe('this room is closed');
  });
});
