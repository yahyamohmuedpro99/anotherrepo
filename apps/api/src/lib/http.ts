/** Throwing one of these sends `{ error, message }` with the status code (Fastify honours statusCode). */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}
export const badRequest = (code: string, msg?: string) => new HttpError(400, code, msg);
export const unauthorized = (msg = 'Sign in first') => new HttpError(401, 'unauthorized', msg);
export const forbidden = (msg = 'Not allowed') => new HttpError(403, 'forbidden', msg);
export const notFound = (what = 'Not found') => new HttpError(404, 'not-found', what);
export const conflict = (code: string, msg?: string) => new HttpError(409, code, msg);
export const tooMany = () => new HttpError(429, 'rate-limited', 'Too many requests, try again in a minute');
