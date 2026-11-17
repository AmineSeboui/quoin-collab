import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import { readFrame } from './protocol/index.ts';

const writersOf = (syncFrame: Uint8Array): number[] => {
  const { decoder } = readFrame(syncFrame);
  const step = decoding.readVarUint(decoder);
  if (step === syncProtocol.messageYjsSyncStep1) return [];
  return [...Y.parseUpdateMeta(decoding.readVarUint8Array(decoder)).from.keys()];
};

/** The client ids a server has assigned one document, one per comment-only connection. */
export class AssignedIds {
  private readonly all = new Set<number>();
  private current: number | null = null;

  /** A new connection, assigned nothing yet; a writer's or a reader's never is. */
  startConnection(): void {
    this.current = null;
  }

  assign(clientID: number): void {
    this.current = clientID;
    this.all.add(clientID);
  }

  /**
   * Whether the sync step 2 answering a comment-only connection's server carries a change under an id an earlier
   * connection was assigned. The server lacks that change and takes writes only under the id it assigned now, so the
   * change can never reach the room.
   */
  carriesLostChange(stepTwo: Uint8Array): boolean {
    const current = this.current;
    return current !== null && writersOf(stepTwo).some((id) => id !== current && this.all.has(id));
  }
}
