import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const server = new URL('../src/protocol/', import.meta.url);
const client = new URL('../../client/src/protocol/', import.meta.url);

const files = (folder: URL): string[] => readdirSync(folder).sort();
const read = (folder: URL, name: string): string => readFileSync(new URL(name, folder), 'utf8');

describe('the protocol', () => {
  it('is the same file for file in the client as in the server, so neither end can drift from the other', () => {
    expect(files(client)).toEqual(files(server));
    for (const name of files(server)) expect(read(client, name), name).toBe(read(server, name));
  });
});
