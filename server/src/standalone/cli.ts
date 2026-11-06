#!/usr/bin/env node
import { createCollabServer } from '../server.ts';
import { tokenAuthorize } from '../token.ts';
import { startStandalone } from './http-server.ts';
import { storesFromEnv } from './stores.ts';

const env = process.env;
const port = Number(env.PORT ?? 1234);

const { persistence, fanout, notes } = await storesFromEnv(env);
const secret = env.QUOIN_COLLAB_SECRET;
if (!secret) notes.push('every connection is accepted, because QUOIN_COLLAB_SECRET is not set');

const collab = createCollabServer({
  persistence,
  fanout,
  authorize: secret ? tokenAuthorize(secret) : undefined,
});

const { close } = await startStandalone({ collab, port, host: env.HOST });
console.log(`Quoin collaboration server listening on :${port}`);
for (const note of notes) console.log(`  ${note}`);

const stop = async () => {
  await close();
  await collab.close();
  process.exit(0);
};
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
