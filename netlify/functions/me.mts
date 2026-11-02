import type { Config } from '@netlify/functions';
import { requireUser, UnauthorizedError } from '../../src/server/auth';

export default async function handler(req: Request) {
  if (req.method !== 'GET') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try { const userId = await requireUser(req);
    return Response.json({ authenticated: true, userId }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof UnauthorizedError) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: 'Authentication temporarily unavailable' }, { status: 503 });
  }
}
export const config: Config = { path: '/api/me', method: ['GET'] };
