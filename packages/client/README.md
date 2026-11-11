# quoin-collab-client

A browser provider for [Yjs](https://yjs.dev) documents: one WebSocket to one room, awareness, and a
reconnect that treats a closed socket as normal rather than as a failure. MIT.

```bash
npm install quoin-collab-client yjs
```

```ts
import { CollabProvider } from 'quoin-collab-client';

const provider = new CollabProvider({
  url: 'wss://collab.example.com',
  room: 'design-notes',
  token: () => fetch('/api/room-token/design-notes').then((r) => r.text()),
});

provider.on('status', (status) => console.log(status));
provider.on('sync', (synced) => console.log(synced ? 'caught up' : 'behind'));
```

It carries `doc`, `awareness`, `synced` and a `sync` event, so it drops into anything that expects
y-websocket's provider, including [Quoin](https://quoincloud.com)'s collaboration extension. Pass your own
`Y.Doc` or `Awareness` and it will use them; leave them out and it makes them.

`token` may be a string or a function, and the function is called before every connect, so a token that
expires in five minutes is refreshed rather than carried around.

## Why not y-websocket's provider

Use y-websocket's. The wire is the same protocol, either end works with either, and a client you already
have is one fewer thing to install.

The reason this one exists is size: about 32 kB unpacked against y-websocket's 92 kB, because it does one
thing and carries no other provider with it. Both handle the close a serverless function's time limit
causes, and handle it in roughly the same time: y-websocket 3 resets its backoff once a connection has
synced, so a routine close costs about 200 milliseconds, and this one costs 75 to 150. That is a difference
of milliseconds and not a reason to switch.

The server it talks to is [quoin-collab-server](https://www.npmjs.com/package/quoin-collab-server), and the
source is at [AmineSeboui/quoin-collab](https://github.com/AmineSeboui/quoin-collab).
