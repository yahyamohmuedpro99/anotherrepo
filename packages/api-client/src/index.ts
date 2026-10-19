import type { paths } from './schema.js';

export type { paths } from './schema.js';

type Method = 'get' | 'post' | 'patch' | 'delete';
type Op<P extends keyof paths, M extends Method> = paths[P][M];
/** JSON body type of an operation, from the OpenAPI spec. */
export type BodyOf<P extends keyof paths, M extends Method> =
  Op<P, M> extends { requestBody: { content: { 'application/json': infer B } } }
    ? B
    : Op<P, M> extends { requestBody?: { content: { 'application/json': infer B } } }
      ? B | undefined
      : undefined;
type QueryOf<P extends keyof paths, M extends Method> = Op<P, M> extends { parameters: { query?: infer Q } } ? Q : never;
type PathsWith<M extends Method> = { [P in keyof paths]: paths[P][M] extends undefined | never ? never : P }[keyof paths];

export interface ApiOptions {
  /** e.g. "/api" in the portal (proxied to the API), "http://localhost:4000" from Node. */
  baseUrl: string;
  token?: () => string | null | undefined;
  fetch?: typeof fetch;
  /** Called on 401 once; return true when a new token is available and the call should be retried. */
  onUnauthorized?: () => Promise<boolean>;
}

/** Error body every API error uses. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: unknown,
  ) {
    super(message);
  }
}

function fill(path: string, params: Record<string, string> = {}): string {
  return path.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = params[k];
    if (v === undefined) throw new Error(`missing path param ${k} for ${path}`);
    return encodeURIComponent(v);
  });
}

/**
 * Typed API client: paths, path params, query and JSON bodies are checked against the OpenAPI spec generated
 * from the API's own route schemas. Responses are typed by the caller (`api.get<Report>(…)`).
 */
export function createApi(opts: ApiOptions) {
  const f = opts.fetch ?? fetch;
  async function call<T>(method: Method, path: string, init: { params?: Record<string, string>; query?: Record<string, unknown>; body?: unknown } = {}, retried = false): Promise<T> {
    const url = new URL(opts.baseUrl.replace(/\/$/, '') + fill(path, init.params), 'http://x');
    for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    const headers: Record<string, string> = {};
    const t = opts.token?.();
    if (t) headers.authorization = `Bearer ${t}`;
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    const target = /^https?:/.test(opts.baseUrl) ? url.toString() : url.pathname + url.search;
    const res = await f(target, { method: method.toUpperCase(), headers, credentials: 'include', ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}) });
    if (res.status === 401 && !retried && opts.onUnauthorized && (await opts.onUnauthorized())) return call<T>(method, path, init, true);
    const type = res.headers.get('content-type') ?? '';
    const body: unknown = type.includes('json') ? await res.json() : await res.text();
    if (!res.ok) {
      const e = (body ?? {}) as { error?: string; message?: string };
      throw new ApiError(res.status, e.error ?? 'error', e.message ?? res.statusText, body);
    }
    return body as T;
  }
  return {
    get: <T = unknown, P extends PathsWith<'get'> = PathsWith<'get'>>(path: P, init?: { params?: Record<string, string>; query?: QueryOf<P, 'get'> }) => call<T>('get', path, init as never),
    post: <T = unknown, P extends PathsWith<'post'> = PathsWith<'post'>>(path: P, body?: BodyOf<P, 'post'>, init?: { params?: Record<string, string>; query?: QueryOf<P, 'post'> }) => call<T>('post', path, { ...(init as object), body }),
    patch: <T = unknown, P extends PathsWith<'patch'> = PathsWith<'patch'>>(path: P, body: BodyOf<P, 'patch'>, init?: { params?: Record<string, string> }) => call<T>('patch', path, { ...init, body }),
    del: <T = unknown, P extends PathsWith<'delete'> = PathsWith<'delete'>>(path: P, init?: { params?: Record<string, string> }) => call<T>('delete', path, init),
    /** Absolute URL for downloads (CSV, SVG sheets) that the browser fetches itself. */
    url: (path: keyof paths, params?: Record<string, string>) => opts.baseUrl.replace(/\/$/, '') + fill(path, params),
  };
}

export type Api = ReturnType<typeof createApi>;
