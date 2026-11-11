# quoin-collab-server

A self-hostable Yjs collaboration server: rooms, presence, persistence and horizontal fanout, speaking
[y-websocket](https://github.com/yjs/y-websocket)'s protocol so any Yjs client already talks to it. MIT, and
the same code the hosted service at [quoincloud.com](https://quoincloud.com) runs.

```bash
npx quoin-collab-server
```

That is a working server on port 1234 with documents in memory. Three environment variables make it a
deployment:

| Variable | Without it | With it |
| --- | --- | --- |
| `DATABASE_URL` | Documents go when the process does | Documents are kept in Postgres and survive a restart |
| `REDIS_URL` | A change reaches only the clients on this process | A change reaches every process serving the room |
| `QUOIN_COLLAB_SECRET` | Every connection is accepted | Only connections carrying a token you signed |

Set `REDIS_URL` only when you run more than one replica. The table and the channels are created on first
start, and startup prints which variables it got, so a misconfigured deployment says so in its first four
lines of log.

## Inside a server you already have

The package has no transport of its own. `createCollabServer` gives you rooms, and you hand it sockets:

```ts
import { createCollabServer, memoryPersistence, attachWsSocket } from 'quoin-collab-server';
import { WebSocketServer } from 'ws';

const collab = createCollabServer({ persistence: memoryPersistence() });
const sockets = new WebSocketServer({ port: 1234 });

sockets.on('connection', (socket, request) => {
  void attachWsSocket({
    collab,
    socket,
    request: { room: new URL(request.url ?? '/', 'http://x').pathname.slice(1), token: null, headers: request.headers },
  });
});
```

Postgres and Redis are optional dependencies, reached through a client you pass in, so the same code runs on
Neon, on a Pool of your own, or on neither.

## Who may open a room

Your application knows who the reader is; this server never learns anything about them. It signs a token:

```ts
import { signRoomToken } from 'quoin-collab-server/token';

const token = signRoomToken(
  { room: documentId, exp: Math.floor(Date.now() / 1000) + 300, readOnly: !canEdit },
  process.env.QUOIN_COLLAB_SECRET,
);
```

The format is an HMAC over base64url JSON. `tokenAuthorize` checks it, or pass an `authorize` function of
your own and refuse with a reason the client can read.

## Metrics and health

`GET /health` answers with the rooms and connections it holds, which is what a load balancer should watch.
`GET /metrics` answers in Prometheus text format when `QUOIN_COLLAB_METRICS_TOKEN` is set, to a request
carrying that token and to nothing else. Without the variable no metrics are served at all, because this port
is not always on a network you chose.

Self-hosting, the token format and the architecture are documented at
[quoincloud.com/docs/self-hosting](https://quoincloud.com/docs/self-hosting). The source is at
[AmineSeboui/quoin-collab](https://github.com/AmineSeboui/quoin-collab).
