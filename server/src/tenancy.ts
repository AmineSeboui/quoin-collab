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
};

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
export function tenantAuthorize({ lookup, namespace = prefixed, onError }: TenantAuthorizeOptions): Authorize {
  return async (request): Promise<Authorization | null> => {
    if (request.token === null) return null;
    const unverified = readUnverifiedClaims(request.token);
    const project = unverified?.project;
    if (project === undefined || project === '') return null;

    let tenant: TenantSecrets | null;
    try {
      tenant = await lookup(project);
    } catch (error: unknown) {
      // A lookup that fails must refuse rather than fall through to accepting, so this is caught and denied.
      onError?.(error instanceof Error ? error : new Error(String(error)));
      return null;
    }
    if (tenant === null || tenant.secrets.length === 0) return null;

    const claims = verifyWithAny(request.token, request.room, tenant.secrets);
    if (claims === null) return null;
    return { readOnly: claims.readOnly === true, room: namespace(project, request.room) };
  };
}
