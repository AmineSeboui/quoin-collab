/**
 * Where a room's document rests while nobody is connected. Rooms are merged Yjs states, so `save` replaces
 * rather than appends, and a `load` that returns null means the room has never been written.
 */
export type Persistence = {
  load(room: string): Promise<Uint8Array | null>;
  save(room: string, state: Uint8Array): Promise<void>;
  close?(): Promise<void>;
};
