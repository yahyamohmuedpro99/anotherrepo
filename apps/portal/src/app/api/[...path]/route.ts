/**
 * The browser talks to the API through /api on the portal's own origin, so the refresh cookie is first-party.
 * A route handler (not a next.config rewrite) so API_URL is read when the server starts, not baked in at build:
 * hosts such as Render do not always pass runtime settings into the image build.
 */
const API = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host', 'content-length', 'content-encoding']);

async function proxy(req: Request, { params }: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await params;
  const url = new URL(req.url);
  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (!HOP.has(k)) headers.set(k, v);
  });
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-proto', url.protocol.replace(':', ''));
  let res: Response;
  try {
    res = await fetch(`${API}/${path.map(encodeURIComponent).join('/')}${url.search}`, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? null : await req.arrayBuffer(),
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return Response.json({ error: 'api-unreachable', message: 'The API did not answer' }, { status: 502 });
  }
  const out = new Headers();
  res.headers.forEach((v, k) => {
    if (!HOP.has(k) && k !== 'set-cookie') out.set(k, v);
  });
  for (const c of res.headers.getSetCookie()) out.append('set-cookie', c);
  return new Response(res.body, { status: res.status, headers: out });
}

export const dynamic = 'force-dynamic';
export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
