import { timingSafeEqual } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { CollabServer } from '../server.ts';
import { describeRequest } from './request.ts';
import { keepalive } from './keepalive.ts';
import { attachWsSocket } from '../adapters/attach.ts';
import type { Metrics } from '../metrics.ts';

export type StandaloneOptions = {
  collab: CollabServer;
  port: number;
  host?: string;
  pingIntervalMs?: number;
  /**
   * Serves `GET /metrics` when given. Absent, that path is a room name like any other, which is the right
   * default: metrics belong on a network somebody chose, not on whatever this port is reachable from.
   */
  metrics?: Metrics;
  /** Required in the `Authorization` header to read `/metrics`. Absent, the path is served to anyone who can reach it. */
  metricsToken?: string;
};

const sameToken = (offered: string, expected: string): boolean => {
  const a = Buffer.from(offered);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export type Standalone = { server: Server; close: () => Promise<void> };

/** A plain Node server: `GET /health` for a load balancer, and every other path a room to join. */
export async function startStandalone({
  collab,
  port,
  host,
  pingIntervalMs = 25_000,
  metrics,
  metricsToken,
}: StandaloneOptions): Promise<Standalone> {
  const server = createServer((request, response) => {
    if (metrics !== undefined && request.url === '/metrics') {
      const offered = request.headers.authorization?.replace(/^Bearer /, '') ?? '';
      if (metricsToken !== undefined && !sameToken(offered, metricsToken)) {
        response.writeHead(401, { 'content-type': 'text/plain', 'www-authenticate': 'Bearer' });
        response.end('These metrics want the token in QUOIN_COLLAB_METRICS_TOKEN.\n');
        return;
      }
      response.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' });
      response.end(metrics.render());
      return;
    }
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok', ...collab.stats() }));
      return;
    }
    response.writeHead(426, { 'content-type': 'text/plain' });
    response.end('This endpoint speaks WebSocket.\n');
  });

  const sockets = new WebSocketServer({ server });
  sockets.on('connection', (socket: WebSocket, request) => {
    const described = describeRequest(request);
    if (described === null) {
      socket.close(4400, 'name the room in the path');
      return;
    }
    const stopPinging = keepalive(socket, pingIntervalMs);
    socket.on('close', stopPinging);
    // Marked rather than awaited: it settles on its own and reports through onError, and the connection
    // handler must not block the next upgrade while one socket finishes opening.
    void attachWsSocket({
      collab,
      request: described,
      socket,
      onDenied: stopPinging,
      onError: () => stopPinging(),
    });
  });

  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  return {
    server,
    close: async () => {
      for (const socket of sockets.clients) socket.close(1001, 'the server is stopping');
      await new Promise<void>((resolve) => sockets.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
