import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Database } from './db/client.js';
import type { Config } from './config.js';
import { makeLimits } from './context.js';
import { verifyAccess } from './auth/tokens.js';
import { HttpError } from './lib/http.js';
import { authRoutes } from './routes/auth.js';
import { tenantRoutes } from './routes/tenants.js';
import { classRoutes } from './routes/classes.js';
import { joinRoutes } from './routes/join.js';
import { assignmentRoutes } from './routes/assignments.js';
import { eventRoutes } from './routes/events.js';
import { reportRoutes } from './routes/reports.js';
import { packRoutes } from './routes/packs.js';
import { publisherRoutes } from './routes/publisher.js';
import { sessionRoutes } from './routes/sessions.js';
import { complianceRoutes } from './routes/compliance.js';

export async function buildApp(opts: { database: Database; config: Config; logger?: boolean }): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger
      ? {
          // never log bodies, cookies or tokens: they can carry student names (BRIEF §3 observability)
          redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        }
      : false,
    trustProxy: true,
    bodyLimit: 8 * 1024 * 1024,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: 'array' } },
  }).withTypeProvider<TypeBoxTypeProvider>();
  app.decorate('ctx', { database: opts.database, config: opts.config, limits: makeLimits() });
  app.decorateRequest('auth', null);
  await app.register(cookie);
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'Rihla API', version: '0.1.0', description: 'Tenants, classes, assignments, learning events, reports, packs, publishers and compliance.' },
      components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
      security: [{ bearer: [] }],
    },
  });
  app.addHook('onRequest', async (req) => {
    const h = req.headers.authorization;
    if (h?.startsWith('Bearer ')) req.auth = await verifyAccess(h.slice(7), opts.config.jwtSecret);
  });
  app.setErrorHandler((err: Error & { statusCode?: number; validation?: unknown; code?: string }, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.code, message: err.message, ...('report' in err ? { report: (err as { report: unknown }).report } : {}) });
    if (err.validation) return reply.code(400).send({ error: 'invalid-request', message: err.message });
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.code ?? 'bad-request', message: err.message });
    req.log.error(err);
    return reply.code(500).send({ error: 'server-error', message: 'Something went wrong' });
  });
  app.get('/health', { schema: { hide: true } }, async () => ({ ok: true }));
  app.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());
  for (const r of [authRoutes, tenantRoutes, classRoutes, joinRoutes, assignmentRoutes, eventRoutes, reportRoutes, packRoutes, publisherRoutes, sessionRoutes, complianceRoutes]) await app.register(r);
  return app;
}
