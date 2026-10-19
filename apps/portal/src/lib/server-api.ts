const API = process.env.API_URL ?? 'http://localhost:4000';
export const PLAYER_URL = process.env.NEXT_PUBLIC_PLAYER_URL ?? 'http://localhost:5173';

/** Server-side reads of public API data (catalog, pack pages). Fails soft: pages render an empty state. */
export async function apiGet<T>(path: string, revalidate = 60): Promise<T | null> {
  try {
    const res = await fetch(`${API}${path}`, { next: { revalidate } });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    return (type.includes('json') ? await res.json() : await res.text()) as T;
  } catch {
    return null;
  }
}

export interface PackSummary {
  id: string;
  title: Record<string, string>;
  summary: Record<string, string>;
  subjects: string[];
  grades: string[];
  durationMinutes: number;
  currentVersion: string;
}
export interface PackDetail {
  pack: PackSummary;
  version: string;
  objectives: { id: string; text: Record<string, string> }[];
  pois: { id: string; title: Record<string, string>; scene: string }[];
  items: { id: string; prompt: Record<string, string> }[];
  curriculum: { country: string; grade: string; subject: string; unit?: string; lesson: string; bookPages?: string[] }[];
  startPoi: string | null;
  itemCount: number;
}
