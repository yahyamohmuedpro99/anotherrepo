import { describe, expect, it } from 'vitest';
import { ApiError, createApi } from './index.js';

describe('createApi', () => {
  it('fills path params, sends the token and parses errors', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.includes('report')) return new Response(JSON.stringify({ ok: 1 }), { headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ error: 'not-found', message: 'Class not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    const api = createApi({ baseUrl: '/api', token: () => 'T', fetch: fake });
    expect(await api.get('/v1/assignments/{id}/report', { params: { id: 'asg 1' } })).toEqual({ ok: 1 });
    expect(calls[0]!.url).toBe('/api/v1/assignments/asg%201/report');
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer T');
    await expect(api.patch('/v1/classes/{id}', { name: 'x' }, { params: { id: 'c' } })).rejects.toBeInstanceOf(ApiError);
  });
});
