import { jwtVerify } from 'jose';

/** Mirrors apps/api/src/auth/tokens.ts RoomClaims (kept small so this service does not pull in the API). */
export interface RoomClaims {
  kind: 'room';
  sub: string;
  sid: string;
  tid: string;
  cid: string;
  role: 'student' | 'teacher';
  name: string;
  color: string;
  chat: boolean;
}

export async function verifyRoom(token: string, secret: string): Promise<RoomClaims | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { issuer: 'rihla-api', audience: 'rooms' });
    return payload.kind === 'room' ? (payload as unknown as RoomClaims) : null;
  } catch {
    return null;
  }
}
