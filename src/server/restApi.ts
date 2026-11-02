import { ZodError } from 'zod';
import { UnauthorizedError, requireUser } from './auth';
import { FormActions, NotFoundFault, ValidationFault } from './formActions';
import { ConflictFault, PermissionFault } from './studioRepository';

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: {
  'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff',
} });

export type IdentityProvider = (request: Request) => Promise<string>;
export function createRestHandler(actions = new FormActions(), identity: IdentityProvider = requireUser) {
  return async (request: Request): Promise<Response> => {
    try {
      // Verify identity before any database action or response on private endpoints.
      const userId = await identity(request);
      if (!userId) throw new UnauthorizedError();
      const url = new URL(request.url);
      const path = url.pathname;
      const match = path.match(/^\/api\/forms(?:\/([^/]+))?(?:\/(draft|publish|state|duplicate|theme))?\/?$/);
      if (!match) return json({ ok: false, error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404);
      const id = match[1]; const operation=match[2];
      if (request.method === 'GET' && !id) {
        const limit = url.searchParams.get('limit') ?? 20;
        return json({ ok: true, data: await actions.list(userId, limit) });
      }
      if (request.method === 'GET' && id && !operation) return json({ ok: true, data: await actions.get(userId, id) });
      if (request.method === 'POST' && !id) {
        const input = await readJson(request);
        return json({ ok: true, data: await actions.create(userId, input) }, 201);
      }
      if (request.method === 'PUT' && id && operation==='draft') return json({ok:true,data:await actions.save(userId,id,await readJson(request))});
      if (request.method === 'POST' && id && operation==='publish') return json({ok:true,data:await actions.publish(userId,id,await readJson(request))});
      if (request.method === 'POST' && id && operation==='state') return json({ok:true,data:await actions.state(userId,id,await readJson(request))});
      if (request.method === 'PATCH' && id && operation==='theme') return json({ok:true,data:await actions.theme(userId,id,await readJson(request))});
      if (request.method === 'POST' && id && operation==='duplicate') return json({ok:true,data:await actions.duplicate(userId,id)},201);
      if (request.method === 'PATCH' && id && !operation) {
        const input = await readJson(request);
        return json({ ok: true, data: await actions.rename(userId, id, input) });
      }
      return json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }, 405);
    } catch (error) {
      if (error instanceof UnauthorizedError) return json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
      if (error instanceof ValidationFault || error instanceof NotFoundFault || error instanceof ConflictFault || error instanceof PermissionFault)
        return json({ ok: false, error: { code: error.code, message: error.message } }, error.status);
      if (error instanceof ZodError || error instanceof SyntaxError)
        return json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON request' } }, 400);
      // Do not leak database errors, connection strings or stack traces to clients.
      console.error('Form API error', error instanceof Error ? error.name : 'Unknown error');
      return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Service temporarily unavailable' } }, 503);
    }
  };
}

async function readJson(req: Request): Promise<unknown> {
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json'))
    throw new ValidationFault('Content-Type must be application/json');
  // Reject large payloads without holding an unbounded request body in memory.
  if (Number(req.headers.get('content-length') || 0) > 262_144) throw new ValidationFault('Payload too large');
  const text = await req.text();
  if (text.length > 262_144) throw new ValidationFault('Payload too large');
  return JSON.parse(text) as unknown;
}
