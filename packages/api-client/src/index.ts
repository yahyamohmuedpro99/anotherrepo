import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema.js';

export type { paths } from './schema.js';

export interface RihlaClientOptions {
  baseUrl: string;
  /** Current access token (refreshed by the caller). */
  token?: () => string | null | undefined;
  fetch?: typeof fetch;
}

/**
 * Typed client for the Rihla API. Paths, params and bodies come from the OpenAPI spec generated from the
 * API's own route schemas, so a renamed field fails the portal's typecheck instead of production.
 */
export function rihlaClient(opts: RihlaClientOptions) {
  const client = createClient<paths>({ baseUrl: opts.baseUrl, credentials: 'include', ...(opts.fetch ? { fetch: opts.fetch } : {}) });
  const auth: Middleware = {
    onRequest({ request }) {
      const t = opts.token?.();
      if (t) request.headers.set('authorization', `Bearer ${t}`);
      return request;
    },
  };
  client.use(auth);
  return client;
}

export type RihlaClient = ReturnType<typeof rihlaClient>;

/** Error body every API error uses. */
export interface ApiError {
  error: string;
  message: string;
}
