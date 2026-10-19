'use client';
import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { t as translate, num, pick, type Key, type Lang } from '@/lib/strings';

interface LangCtx {
  lang: Lang;
  t: (key: Key, params?: Record<string, string | number>) => string;
  n: (v: number) => string;
  pick: (l: Record<string, string> | undefined | null) => string;
  toggle: () => void;
}
const Ctx = createContext<LangCtx | null>(null);

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const router = useRouter();
  const toggle = useCallback(() => {
    document.cookie = `lang=${lang === 'ar' ? 'en' : 'ar'};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  }, [lang, router]);
  return <Ctx.Provider value={{ lang, t: (k, p) => translate(lang, k, p), n: (v) => num(lang, v), pick: (l) => pick(lang, l), toggle }}>{children}</Ctx.Provider>;
}

export function useLang(): LangCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useLang outside LangProvider');
  return c;
}
