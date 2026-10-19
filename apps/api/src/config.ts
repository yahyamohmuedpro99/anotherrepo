import { randomBytes } from 'node:crypto';

export interface Config {
  port: number;
  host: string;
  databaseUrl: string;
  /** Signs staff access tokens and student tokens. */
  jwtSecret: string;
  /** Signs short-lived room tokens; shared with apps/rooms. */
  roomSecret: string;
  /** Shared secret for service-to-service calls (rooms → API moderation log). */
  internalSecret: string;
  /** Where the player lives, for QR deep links: https://{domain}. */
  playerUrl: string;
  /** Portal (teachers, schools, publishers): invite links point here. */
  portalUrl: string;
  /** What gets printed under a QR code: https://{short}. */
  shortUrl: string;
  /** Published pack bundles (served by the CDN in production). */
  storageDir: string;
  cookieSecure: boolean;
  production: boolean;
  /** OIDC sign-in for adults stays off until client ids are configured (ADR-0007). */
  oidc: { google?: { clientId: string }; microsoft?: { clientId: string } };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production';
  const secret = (name: string): string => {
    const v = env[name];
    if (v) return v;
    if (production) throw new Error(`${name} must be set in production`);
    return randomBytes(32).toString('hex');
  };
  return {
    port: Number(env.PORT ?? 4000),
    host: env.HOST ?? '0.0.0.0',
    databaseUrl: env.DATABASE_URL ?? 'pglite://.data/api',
    jwtSecret: secret('JWT_SECRET'),
    roomSecret: secret('ROOM_TOKEN_SECRET'),
    internalSecret: secret('INTERNAL_SECRET'),
    playerUrl: (env.PLAYER_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
    portalUrl: (env.PORTAL_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
    shortUrl: (env.SHORT_URL ?? env.PLAYER_URL ?? 'http://localhost:4000/s').replace(/\/$/, ''),
    storageDir: env.STORAGE_DIR ?? new URL('../../../dist/packs', import.meta.url).pathname,
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === '1' : production,
    production,
    oidc: {
      ...(env.OIDC_GOOGLE_CLIENT_ID ? { google: { clientId: env.OIDC_GOOGLE_CLIENT_ID } } : {}),
      ...(env.OIDC_MICROSOFT_CLIENT_ID ? { microsoft: { clientId: env.OIDC_MICROSOFT_CLIENT_ID } } : {}),
    },
  };
}
