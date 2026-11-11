import { afterEach, describe, expect, it } from 'vitest';
import { CollabProvider } from 'quoin-collab-client';
import { memoryFanout } from '../src/fanout/memory.ts';
import { metricsMeter } from '../src/metrics.ts';
import { createCollabServer } from '../src/server.ts';
import { socketsTo } from './fake-socket.ts';
import { settle } from './settle.ts';

const value = (text: string, name: string): number => {
  const line = text.split('\n').find((row) => row.startsWith(`${name} `) || row.startsWith(`${name}{`));
  return line === undefined ? 0 : Number(line.slice(line.lastIndexOf(' ') + 1));
};

const open = (collab: ReturnType<typeof createCollabServer>, room: string, token?: string) =>
  new CollabProvider({ url: 'wss://quoin.test/collab', room, token, socketFactory: socketsTo(collab, room).factory });

const started: ReturnType<typeof createCollabServer>[] = [];
const serve = (options: Parameters<typeof createCollabServer>[0]) => {
  const collab = createCollabServer(options);
  started.push(collab);
  return collab;
};

afterEach(async () => {
  for (const collab of started.splice(0)) await collab.close();
});

describe('what a scrape says', () => {
  it('is Prometheus text, with a type for every series', async () => {
    const metrics = metricsMeter();
    const collab = serve({ meter: metrics });
    open(collab, 'notes');
    await settle();

    const text = metrics.render();
    expect(text).toContain('# TYPE quoin_rooms_loaded gauge');
    expect(text).toContain('# TYPE quoin_connections_opened_total counter');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('counts rooms and connections up, and back down again', async () => {
    const metrics = metricsMeter();
    const collab = serve({ meter: metrics, evictAfterMs: 1 });
    const ada = open(collab, 'notes');
    await settle();
    expect(value(metrics.render(), 'quoin_connections_open')).toBe(1);

    ada.destroy();
    await settle();
    expect(value(metrics.render(), 'quoin_connections_open')).toBe(0);
    expect(value(metrics.render(), 'quoin_connections_opened_total')).toBe(1);
  });

  it('labels a refusal by how coarse the reason is, never by what the client was told', async () => {
    const metrics = metricsMeter();
    const collab = serve({ meter: metrics, authorize: () => ({ denied: 'a sentence that must not be a label' }) });
    open(collab, 'notes', 'nope');
    await settle();

    const text = metrics.render();
    expect(text).toContain('quoin_connections_refused_total{reason="declined"} 1');
    expect(text).not.toContain('a sentence that must not be a label');
  });

  it('counts the bytes of a change and where it came from', async () => {
    const metrics = metricsMeter();
    const collab = serve({ meter: metrics });
    const ada = open(collab, 'notes');
    await settle();
    ada.doc.getText('quoin').insert(0, 'counted');
    await settle();

    const text = metrics.render();
    expect(text).toContain('quoin_updates_applied_total{origin="client"}');
    expect(value(text, 'quoin_update_bytes_total')).toBeGreaterThan(0);
  });
});

/**
 * The reason this file exists. Two processes that cannot reach each other both look healthy, both report
 * connections, and both serve a room that reads fine to the person in it. The only thing that says otherwise
 * is a receive counter that stays at zero while the publish counter climbs.
 */
describe('two processes that cannot reach each other', () => {
  it('publish without ever receiving, which is the only sign anything is wrong', async () => {
    const first = metricsMeter();
    const second = metricsMeter();
    // Two memory fanouts rather than one: each process is talking to a broker the other cannot hear.
    const one = serve({ meter: first, fanout: memoryFanout() });
    const two = serve({ meter: second, fanout: memoryFanout() });

    const ada = open(one, 'notes');
    const grace = open(two, 'notes');
    await settle();
    ada.doc.getText('quoin').insert(0, 'never arrives');
    await settle();

    expect(grace.doc.getText('quoin').toString()).toBe('');
    expect(value(first.render(), 'quoin_fanout_published_total')).toBeGreaterThan(0);
    expect(value(second.render(), 'quoin_fanout_received_total')).toBe(0);
  });

  it('receive once they share a broker, which is the same counter saying so', async () => {
    const first = metricsMeter();
    const second = metricsMeter();
    const shared = memoryFanout();
    const one = serve({ meter: first, fanout: shared, serverId: 'one' });
    const two = serve({ meter: second, fanout: shared, serverId: 'two' });

    const ada = open(one, 'notes');
    const grace = open(two, 'notes');
    await settle();
    ada.doc.getText('quoin').insert(0, 'arrives');
    await settle();

    expect(grace.doc.getText('quoin').toString()).toBe('arrives');
    expect(value(second.render(), 'quoin_fanout_received_total')).toBeGreaterThan(0);
    expect(value(second.render(), 'quoin_updates_applied_total')).toBeGreaterThan(0);
  });
});

describe('storage that is failing', () => {
  it('counts the failures somewhere a dashboard can see them', async () => {
    const metrics = metricsMeter();
    const collab = serve({
      meter: metrics,
      persistence: {
        load: () => Promise.reject(new Error('storage is down')),
        save: () => Promise.reject(new Error('storage is down')),
      },
      onError: () => undefined,
    });
    open(collab, 'notes');
    await settle();

    expect(metrics.render()).toContain('quoin_persistence_failures_total{operation="load"} 1');
  });
});
