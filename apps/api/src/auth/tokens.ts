import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Role } from '../db/schema.js';

export interface StaffClaims {
  kind: 'staff';
  sub: string;
  tid: string;
  roles: Role[];
}
export interface StudentClaims {
  kind: 'student';
  sub: string;
  tid: string;
  cid: string;
}
export type AccessClaims = StaffClaims | StudentClaims;

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

const key = (s: string) => new TextEncoder().encode(s);
const ISS = 'rihla-api';

export async function signAccess(claims: AccessClaims, secret: string, ttl = claims.kind === 'staff' ? '15m' : '12h'): Promise<string> {
  return new SignJWT({ ...claims }).setProtectedHeader({ alg: 'HS256' }).setIssuer(ISS).setAudience('rihla').setIssuedAt().setExpirationTime(ttl).sign(key(secret));
}

export async function verifyAccess(token: string, secret: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { issuer: ISS, audience: 'rihla' });
    if (payload.kind === 'staff' || payload.kind === 'student') return payload as unknown as AccessClaims;
    return null;
  } catch {
    return null;
  }
}

/** Room tokens: one live session, two hours at most (rooms close after 90 minutes). */
export async function signRoom(claims: RoomClaims, secret: string): Promise<string> {
  return new SignJWT({ ...claims }).setProtectedHeader({ alg: 'HS256' }).setIssuer(ISS).setAudience('rooms').setIssuedAt().setExpirationTime('2h').sign(key(secret));
}

export async function verifyRoom(token: string, secret: string): Promise<RoomClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { issuer: ISS, audience: 'rooms' });
    return payload.kind === 'room' ? (payload as unknown as RoomClaims) : null;
  } catch {
    return null;
  }
}

/** Opaque random tokens (refresh tokens, invites); only their SHA-256 is stored. */
export function opaqueToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: sha256(token) };
}
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
