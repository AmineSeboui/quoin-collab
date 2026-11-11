import type { Meter, MeterEvent } from './meter.ts';

export type Metrics = Meter & { render(): string };

type Counters = {
  connectionsOpened: number;
  connectionsRefused: Record<string, number>;
  updatesApplied: Record<string, number>;
  updateBytes: Record<string, number>;
  fanoutPublished: Record<string, number>;
  fanoutReceived: Record<string, number>;
  persistenceLoads: number;
  persistenceLoadMs: number;
  persistenceSaves: number;
  persistenceSaveMs: number;
  persistenceSaveBytes: number;
  persistenceFailures: Record<string, number>;
};

type Gauges = { rooms: number; connections: number };

const bump = (into: Record<string, number>, key: string, by = 1) => {
  into[key] = (into[key] ?? 0) + by;
};

const line = (name: string, value: number, labels?: Record<string, string>) => {
  if (labels === undefined) return `${name} ${value}`;
  const pairs = Object.entries(labels)
    .map(([key, text]) => `${key}="${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
    .join(',');
  return `${name}{${pairs}} ${value}`;
};

const block = (name: string, help: string, type: 'counter' | 'gauge', lines: string[]): string[] =>
  lines.length === 0 ? [] : [`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`, ...lines];

const labelled = (name: string, label: string, counts: Record<string, number>): string[] =>
  Object.entries(counts).map(([value, count]) => line(name, count, { [label]: value }));

/**
 * Counts what an operator needs and renders it in the format Prometheus reads, which is the one most
 * monitoring already speaks.
 *
 * The fanout counters are the point of this rather than a detail of it. Two instances that cannot reach each
 * other both report healthy, both report connections, and both serve a room that looks fine to the person in
 * it. A receive counter sitting at zero while the publish counter climbs is the only signal that says so.
 */
export function metricsMeter(): Metrics {
  const gauges: Gauges = { rooms: 0, connections: 0 };
  const counters: Counters = {
    connectionsOpened: 0,
    connectionsRefused: {},
    updatesApplied: {},
    updateBytes: {},
    fanoutPublished: {},
    fanoutReceived: {},
    persistenceLoads: 0,
    persistenceLoadMs: 0,
    persistenceSaves: 0,
    persistenceSaveMs: 0,
    persistenceSaveBytes: 0,
    persistenceFailures: {},
  };

  const record = (event: MeterEvent): void => {
    switch (event.kind) {
      case 'room.opened':
        gauges.rooms += 1;
        return;
      case 'room.closed':
        gauges.rooms -= 1;
        return;
      case 'connection.opened':
        gauges.connections += 1;
        counters.connectionsOpened += 1;
        return;
      case 'connection.closed':
        gauges.connections -= 1;
        return;
      case 'connection.refused':
        bump(counters.connectionsRefused, event.reason);
        return;
      case 'update.applied':
        bump(counters.updatesApplied, event.origin);
        bump(counters.updateBytes, event.origin, event.bytes);
        return;
      case 'fanout.published':
        bump(counters.fanoutPublished, event.message);
        return;
      case 'fanout.received':
        bump(counters.fanoutReceived, event.message);
        return;
      case 'persistence.loaded':
        counters.persistenceLoads += 1;
        counters.persistenceLoadMs += event.ms;
        return;
      case 'persistence.saved':
        counters.persistenceSaves += 1;
        counters.persistenceSaveMs += event.ms;
        counters.persistenceSaveBytes += event.bytes;
        return;
      case 'persistence.failed':
        bump(counters.persistenceFailures, event.operation);
        return;
    }
  };

  const render = (): string =>
    [
      ...block('quoin_rooms_loaded', 'Rooms loaded in this process.', 'gauge', [
        line('quoin_rooms_loaded', gauges.rooms),
      ]),
      ...block('quoin_connections_open', 'Connections attached to this process.', 'gauge', [
        line('quoin_connections_open', gauges.connections),
      ]),
      ...block('quoin_connections_opened_total', 'Connections accepted since start.', 'counter', [
        line('quoin_connections_opened_total', counters.connectionsOpened),
      ]),
      ...block('quoin_connections_refused_total', 'Connections turned away since start.', 'counter',
        labelled('quoin_connections_refused_total', 'reason', counters.connectionsRefused)),
      ...block('quoin_updates_applied_total', 'Document updates applied, by where they came from.', 'counter',
        labelled('quoin_updates_applied_total', 'origin', counters.updatesApplied)),
      ...block('quoin_update_bytes_total', 'Bytes of document update applied, by where they came from.', 'counter',
        labelled('quoin_update_bytes_total', 'origin', counters.updateBytes)),
      ...block('quoin_fanout_published_total', 'Messages published to other processes.', 'counter',
        labelled('quoin_fanout_published_total', 'message', counters.fanoutPublished)),
      ...block('quoin_fanout_received_total', 'Messages received from other processes.', 'counter',
        labelled('quoin_fanout_received_total', 'message', counters.fanoutReceived)),
      ...block('quoin_persistence_loads_total', 'Rooms read from storage.', 'counter', [
        line('quoin_persistence_loads_total', counters.persistenceLoads),
      ]),
      ...block('quoin_persistence_load_seconds_total', 'Time spent reading rooms from storage.', 'counter', [
        line('quoin_persistence_load_seconds_total', counters.persistenceLoadMs / 1000),
      ]),
      ...block('quoin_persistence_saves_total', 'Rooms written to storage.', 'counter', [
        line('quoin_persistence_saves_total', counters.persistenceSaves),
      ]),
      ...block('quoin_persistence_save_seconds_total', 'Time spent writing rooms to storage.', 'counter', [
        line('quoin_persistence_save_seconds_total', counters.persistenceSaveMs / 1000),
      ]),
      ...block('quoin_persistence_save_bytes_total', 'Bytes of room state written to storage.', 'counter', [
        line('quoin_persistence_save_bytes_total', counters.persistenceSaveBytes),
      ]),
      ...block('quoin_persistence_failures_total', 'Storage operations that threw.', 'counter',
        labelled('quoin_persistence_failures_total', 'operation', counters.persistenceFailures)),
    ].join('\n') + '\n';

  return { record, render };
}
