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

Use y-websocket's if it suits you: the wire is the same protocol and either end works with either. This one
is smaller, and it reconnects when a serverless function's time limit closes a healthy socket, which looks
like a crash to a provider that was not expecting it.

The server it talks to is [quoin-collab-server](https://www.npmjs.com/package/quoin-collab-server), and the
source is at [AmineSeboui/quoin-collab](https://github.com/AmineSeboui/quoin-collab).
