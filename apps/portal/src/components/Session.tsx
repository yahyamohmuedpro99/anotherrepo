'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createApi, type Api } from '@rihla/api-client';

export interface SessionData {
  accessToken: string;
  user: { id: string; name: string; email: string; locale: string };
  tenant: { id: string; name: string; kind: string };
  roles: string[];
  tenants: { id: string; name: string; kind: string; roles: string[] }[];
}

interface SessionCtx {
  session: SessionData | null;
  ready: boolean;
  api: Api;
  login(email: string, password: string): Promise<SessionData>;
  acceptInvite(token: string, password: string): Promise<SessionData>;
  logout(): Promise<void>;
  switchTenant(id: string): Promise<void>;
  has(...roles: string[]): boolean;
}
const Ctx = createContext<SessionCtx | null>(null);
const TENANT_KEY = 'rihla.tenant';

/**
 * Access tokens live in memory only; the refresh token is an httpOnly cookie the browser sends to /api.
 * A reload silently refreshes; tokens are renewed every 12 minutes (they expire after 15).
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [ready, setReady] = useState(false);
  const tokenRef = useRef<string | null>(null);
  const refreshing = useRef<Promise<boolean> | null>(null);

  const apply = (s: SessionData | null) => {
    tokenRef.current = s?.accessToken ?? null;
    setSession(s);
    if (s) localStorage.setItem(TENANT_KEY, s.tenant.id);
  };

  const refresh = useCallback(async (tenantId?: string): Promise<boolean> => {
    if (refreshing.current) return refreshing.current;
    refreshing.current = (async () => {
      try {
        const tid = tenantId ?? localStorage.getItem(TENANT_KEY) ?? '';
        const res = await fetch(`/api/v1/auth/refresh${tid ? `?tenantId=${encodeURIComponent(tid)}` : ''}`, { method: 'POST', credentials: 'include' });
        if (!res.ok) {
          apply(null);
          return false;
        }
        apply((await res.json()) as SessionData);
        return true;
      } catch {
        return false;
      } finally {
        refreshing.current = null;
      }
    })();
    return refreshing.current;
  }, []);

  const api = useMemo(() => createApi({ baseUrl: '/api', token: () => tokenRef.current, onUnauthorized: () => refresh() }), [refresh]);

  useEffect(() => {
    void refresh().finally(() => setReady(true));
    const id = setInterval(() => {
      if (tokenRef.current) void refresh();
    }, 12 * 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  const value: SessionCtx = {
    session,
    ready,
    api,
    async login(email, password) {
      const s = await api.post<SessionData>('/v1/auth/login', { email, password, tenantId: localStorage.getItem(TENANT_KEY) ?? undefined });
      apply(s);
      return s;
    },
    async acceptInvite(token, password) {
      const s = await api.post<SessionData>('/v1/auth/accept-invite', { token, password });
      apply(s);
      return s;
    },
    async logout() {
      await api.post('/v1/auth/logout').catch(() => undefined);
      apply(null);
    },
    async switchTenant(id) {
      await refresh(id);
    },
    has: (...roles) => !!session && session.roles.some((r) => roles.includes(r) || r === 'platform_admin'),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession outside SessionProvider');
  return c;
}

/** Downloads an authenticated file (CSV, SVG sheet) through fetch so the bearer token is sent. */
export async function download(url: string, token: string | null, filename: string): Promise<void> {
  const res = await fetch(url, { headers: token ? { authorization: `Bearer ${token}` } : {}, credentials: 'include' });
  if (!res.ok) throw new Error(`${res.status}`);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
