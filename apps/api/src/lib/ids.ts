import { randomBytes, randomInt } from 'node:crypto';

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';

/** Opaque ids with a readable prefix: cls_x7k2…, stu_…, asg_…. */
export function newId(prefix: string, len = 16): string {
  const bytes = randomBytes(len);
  let s = '';
  for (const b of bytes) s += B32[b & 31];
  return `${prefix}_${s}`;
}

/** Board-friendly class join codes: 6 characters, no 0/O or 1/I/L. */
const JOIN = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function joinCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += JOIN[randomInt(JOIN.length)];
  return s;
}

/** Printed QR slugs: lowercase, unambiguous, 7 characters (≈ 2·10¹⁰ codes). */
const SLUG = 'abcdefghjkmnpqrstuvwxyz23456789';
export function slug(len = 7): string {
  let s = '';
  for (let i = 0; i < len; i++) s += SLUG[randomInt(SLUG.length)];
  return s;
}

export const isJoinCode = (c: string) => /^[A-Z2-9]{6}$/.test(c);
