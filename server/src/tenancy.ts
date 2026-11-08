import type { Authorize, Authorization } from './auth.ts';
import { readUnverifiedClaims, verifyWithAny } from './token.ts';

/** What a tenant lookup answers with. More than one secret is how a rotation stays survivable. */
export type TenantSecrets = { secrets: readonly string[] };

export type LookupTenant = (projectId: string) => Promise<TenantSecrets | null> | TenantSecrets | null;

export type TenantAuthorizeOptions = {
  lookup: LookupTenant;
  /**
   * How a tenant's rooms are named inside the server. The default prefixes the project id, which cannot
   * collide because a project id holds no slash. Override it only with something equally unambiguous.
   */
  namespace?: (projectId: string, room: string) => string;
  onError?: (error: Error) => void;
  /**
   * Why a connection was turned away, for the log. Deliberately separate from what the client is told, which
   * stays vague on purpose: a stranger guessing at tokens should not be told which part of theirs was wrong.
   * In the logs it is the single most useful thing to know, because a denial and a network fault otherwise
   * look identical.
   */
  onRefused?: (reason: TenantRefusal, room: string) => void;
};

export type TenantRefusal = 'no-token' | 'no-project' | 'unknown-project' | 'bad-signature' | 'lookup-failed';

const prefixed = (projectId: string, room: string) => `${projectId}/${room}`;

/**
 * Authorization for a deployment serving more than one customer.
 *
 * The token names its project, so the project is read from the token before anything is trusted, used to find
 * that project's secrets, and only then is the signature checked against them. A token claiming a project it
 * cannot sign for fails at that last step, which is the only one that decides anything.
 *
 * The room the connection opens is namespaced by project. Two customers who both call a room `notes` get two
 * documents, and neither ever sees the rewritten name.
 */
export function tenantAuthorize({
  lookup,
  namespace = prefixed,
  onError,
  onRefused,
}: TenantAuthorizeOptions): Authorize {
  return async (request): Promise<Authorization | null> => {
    const refuse = (reason: TenantRefusal) => {
      onRefused?.(reason, request.room);
      return null;
    };

    if (request.token === null) return refuse('no-token');
    const unverified = readUnverifiedClaims(request.token);
    const project = unverified?.project;
    if (project === undefined || project === '') return refuse('no-project');

    let tenant: TenantSecrets | null;
    try {
      tenant = await lookup(project);
    } catch (error: unknown) {
      // A lookup that fails must refuse rather than fall through to accepting, so this is caught and denied.
      onError?.(error instanceof Error ? error : new Error(String(error)));
      return refuse('lookup-failed');
    }
    if (tenant === null || tenant.secrets.length === 0) return refuse('unknown-project');

    const claims = verifyWithAny(request.token, request.room, tenant.secrets);
    if (claims === null) return refuse('bad-signature');
    return { readOnly: claims.readOnly === true, room: namespace(project, request.room), subject: claims.subject };
  };
}
