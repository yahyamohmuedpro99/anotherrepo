import { cookies } from 'next/headers';
import type { Lang } from './strings';

/** Arabic unless the visitor switched to English (cookie set by the language toggle). */
export async function getLang(): Promise<Lang> {
  const c = (await cookies()).get('lang')?.value;
  return c === 'en' ? 'en' : 'ar';
}
