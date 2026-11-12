import { deniedFrame } from './protocol/index.ts';
import type { Authorize, ConnectionRequest } from './auth.ts';
import type { Fanout } from './fanout/fanout.ts';
import { memoryFanout } from './fanout/memory.ts';
import type { Persistence } from './persistence/persistence.ts';
import { memoryPersistence } from './persistence/memory.ts';
import { noMeter, type Meter } from './meter.ts';
import { openConnection } from './connection.ts';
import { Rooms } from './rooms.ts';
import type { ConnectionHandle, SocketSink } from './transport.ts';

export type CollabServerOptions = {
  /** Where rooms rest between sessions. In memory by default, which loses them when the process stops. */
  persistence?: Persistence;
  /** How processes serving one room reach each other. Not needed while there is only one. */
  fanout?: Fanout;
  /** Absent, every connection is accepted. */
  authorize?: Authorize;
  /** What counts rooms, connections and people. Counts nothing by default. */
  meter?: Meter;
  serverId?: string;
  /** How long a change waits before the room is written out. */
  saveAfterMs?: number;
  /** How long an empty room is kept loaded, so a reconnect does not read it again. */
  evictAfterMs?: number;
  onError?: (error: Error) => void;
};

export type CollabServer = {
  /** Null when the request was turned away; the sink has been sent a denial and closed by then. */
  connect(request: ConnectionRequest, sink: SocketSink): Promise<ConnectionHandle | null>;
  stats(): { rooms: number; connections: number };
  flush(): Promise<void>;
  close(): Promise<void>;
};

export function createCollabServer(options: CollabServerOptions = {}): CollabServer {
  const onError = options.onError ?? ((error: Error) => console.error(error));
  const persistence = options.persistence ?? memoryPersistence();
  const fanout = options.fanout ?? memoryFanout();
  const meter = options.meter ?? noMeter();
  const rooms = new Rooms({
    persistence,
    fanout,
    serverId: options.serverId ?? crypto.randomUUID(),
    saveAfterMs: options.saveAfterMs ?? 2_000,
    evictAfterMs: options.evictAfterMs ?? 30_000,
    meter,
    onError,
  });

  return {
    async connect(request, sink) {
      // Absent means "accept everything"; present and null means "turn this one away". `??` would conflate them.
      const granted = options.authorize === undefined ? {} : await options.authorize(request);
      if (granted === null || 'denied' in granted) {
        meter.record({ kind: 'connection.refused', reason: granted === null ? 'unauthorized' : 'declined' });
        sink.send(deniedFrame(granted?.denied ?? 'This room is not open to you.'));
        sink.close(4401, 'unauthorized');
        return null;
      }
      // An authorizer that namespaces picks the real name; without one the client's own name is used.
      const room = await rooms.acquire(granted.room ?? request.room);
      return openConnection({
        room,
        sink,
        readOnly: granted.readOnly === true,
        subject: granted.subject,
        meter,
        onError,
      });
    },
    stats: () => ({ rooms: rooms.count, connections: rooms.connections }),
    flush: () => rooms.flush(),
    close: async () => {
      await rooms.close();
      await persistence.close?.();
      await fanout.close?.();
      await meter.close?.();
    },
  };
}
