import type { FastifyRequest } from 'fastify';
import type { Database } from './db/client.js';
import type { Config } from './config.js';
import type { AccessClaims, StaffClaims, StudentClaims } from './auth/tokens.js';
import type { Role } from './db/schema.js';
import { RateLimiter } from './lib/rate-limit.js';
import { forbidden, unauthorized } from './lib/http.js';

export interface AppContext {
  database: Database;
  config: Config;
  limits: { login: RateLimiter; scan: RateLimiter; scanDevice: RateLimiter; join: RateLimiter; events: RateLimiter };
}

export function makeLimits(): AppContext['limits'] {
  return {
    login: new RateLimiter(10, 15 * 60_000),
    scan: new RateLimiter(120, 60_000),
    scanDevice: new RateLimiter(30, 60_000),
    join: new RateLimiter(30, 60_000),
    events: new RateLimiter(600, 60_000),
  };
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AccessClaims | null;
  }
  interface FastifyInstance {
    ctx: AppContext;
  }
}

/** The signed-in adult, optionally requiring one of the roles (platform admins pass every role check). */
export function staff(req: FastifyRequest, ...roles: Role[]): StaffClaims {
  const a = req.auth;
  if (!a) throw unauthorized();
  if (a.kind !== 'staff') throw forbidden();
  if (roles.length && !a.roles.some((r) => roles.includes(r) || r === 'platform_admin')) throw forbidden(`Needs role: ${roles.join(' or ')}`);
  return a;
}

export function student(req: FastifyRequest): StudentClaims {
  const a = req.auth;
  if (!a) throw unauthorized();
  if (a.kind !== 'student') throw forbidden();
  return a;
}

export const isAdmin = (a: StaffClaims) => a.roles.includes('school_admin') || a.roles.includes('platform_admin');
