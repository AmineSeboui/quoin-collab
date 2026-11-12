import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Installs the two packages the way a stranger would, from the tarballs `npm pack` makes, then typechecks
 * and runs a consumer against them. It is the only check that sees what `files`, `exports` and the emitted
 * extensions actually ship, rather than what the workspace resolves by symlink.
 */

const root = resolve(import.meta.dirname, '..');
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: 'pipe', encoding: 'utf8' });

const where = mkdtempSync(join(tmpdir(), 'quoin-collab-consumer-'));
process.on('exit', () => rmSync(where, { recursive: true, force: true }));

run('npm', ['pack', '--workspaces', '--pack-destination', where], root);

const version = JSON.parse(run('npm', ['pkg', 'get', 'version', '--workspace', 'quoin-collab-server'], root))[
  'quoin-collab-server'
];
const tarball = (name) => join(where, `${name}-${version}.tgz`);

writeFileSync(join(where, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }));
writeFileSync(
  join(where, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2022'],
      module: 'NodeNext',
      moduleResolution: 'nodenext',
      strict: true,
      skipLibCheck: true,
      noEmit: true,
    },
    include: ['use.ts'],
  }),
);
writeFileSync(
  join(where, 'use.ts'),
  `import { createCollabServer, memoryPersistence, memoryFanout } from 'quoin-collab-server';
import { signRoomToken, verifyRoomToken } from 'quoin-collab-server/token';
import { CollabProvider } from 'quoin-collab-client';

const collab = createCollabServer({ persistence: memoryPersistence(), fanout: memoryFanout() });
const token = signRoomToken({ room: 'notes', exp: 1 }, 'secret');
export const checked = [collab.stats(), verifyRoomToken(token, 'notes', 'secret'), CollabProvider];
`,
);
writeFileSync(
  join(where, 'run.mjs'),
  `import { createCollabServer, memoryPersistence } from 'quoin-collab-server';
import { signRoomToken, verifyRoomToken } from 'quoin-collab-server/token';
import { CollabProvider } from 'quoin-collab-client';

const collab = createCollabServer({ persistence: memoryPersistence() });
const token = signRoomToken({ room: 'notes', exp: Math.floor(Date.now() / 1000) + 60 }, 'secret');
if (verifyRoomToken(token, 'notes', 'secret')?.room !== 'notes') throw new Error('a token did not survive the round trip');
if (typeof CollabProvider !== 'function') throw new Error('the provider is not a class');
if (typeof collab.stats().rooms !== 'number') throw new Error('the server does not report its rooms');
await collab.close();
console.log('the published packages install, typecheck and run');
`,
);

run(
  'npm',
  ['install', '--no-audit', '--no-fund', tarball('quoin-collab-server'), tarball('quoin-collab-client'), 'yjs',
   'typescript', '@types/node'],
  where,
);
run('npx', ['tsc', '-p', 'tsconfig.json'], where);
process.stdout.write(run('node', ['run.mjs'], where));
