import { describe, expect, it } from 'vitest';
import { CollabProvider } from 'quoin-collab-client';
import { createCollabServer } from '../src/server.ts';
import { memoryMeter, noMeter, type MeterEvent } from '../src/meter.ts';
import { tenantAuthorize } from '../src/tenancy.ts';
import { signRoomToken } from '../src/token.ts';
import { socketsTo } from './fake-socket.ts';
import { settle } from './settle.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const recording = () => {
  const events: MeterEvent[] = [];
  return { events, meter: { record: (event: MeterEvent) => void events.push(event) } };
};

describe('metering', () => {
  it('counts nothing by default, so a self-hoster pays for no bookkeeping', async () => {
    const meter = noMeter();
    expect(meter.record({ kind: 'room.opened', room: 'notes' })).toBeUndefined();
  });

  it('reports a room opening and a connection with it', async () => {
    const { events, meter } = recording();
    const collab = createCollabServer({ meter });
    const ada = new CollabProvider({ url: 'wss://q/c', room: 'notes', socketFactory: socketsTo(collab, 'notes').factory });
    await settle();

    expect(events).toEqual([
      { kind: 'room.opened', room: 'notes' },
      { kind: 'connection.opened', room: 'notes', subject: undefined },
    ]);
    ada.destroy();
    await collab.close();
  });

  it('reports the connection closing, and the room once it is dropped', async () => {
    const { events, meter } = recording();
    const collab = createCollabServer({ meter, saveAfterMs: 1, evictAfterMs: 1 });
    const ada = new CollabProvider({ url: 'wss://q/c', room: 'brief', socketFactory: socketsTo(collab, 'brief').factory });
    await settle();
    ada.destroy();
    await sleep(40);

    expect(events.map((event) => event.kind)).toEqual([
      'room.opened',
      'connection.opened',
      'connection.closed',
      'room.closed',
    ]);
    await collab.close();
  });

  it('carries the subject the token named, so people can be counted rather than connections', async () => {
    const { events, meter } = recording();
    const secret = 'project-secret';
    const collab = createCollabServer({
      meter,
      authorize: tenantAuthorize({ lookup: () => ({ secrets: [secret] }) }),
    });
    const token = signRoomToken(
      { room: 'notes', exp: Math.floor(Date.now() / 1000) + 60, project: 'proj', subject: 'user-42' },
      secret,
    );
    const ada = new CollabProvider({
      url: 'wss://q/c',
      room: 'notes',
      token,
      socketFactory: socketsTo(collab, 'notes').factory,
    });
    await settle();

    expect(events).toContainEqual({ kind: 'connection.opened', room: 'proj/notes', subject: 'user-42' });
    ada.destroy();
    await collab.close();
  });

  it('holds distinct people rather than growing with every connection', async () => {
    const meter = memoryMeter();
    for (let i = 0; i < 5; i += 1) meter.record({ kind: 'connection.opened', room: 'notes', subject: 'same-person' });
    meter.record({ kind: 'connection.opened', room: 'notes', subject: 'another-person' });

    expect(meter.counts.subjects.size).toBe(2);
    expect(meter.counts.connections).toBe(6);
  });
});
