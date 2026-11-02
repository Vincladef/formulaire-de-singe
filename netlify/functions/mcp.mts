import type { Config } from '@netlify/functions';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { requireUser, UnauthorizedError } from '../../src/server/auth';
import type { IdentityProvider } from '../../src/server/restApi';
import { buildMcpServer } from '../../src/server/mcpServer';
import { FormActions } from '../../src/server/formActions';

/** Stateless Streamable HTTP: fresh server per POST, no OAuth shortcuts. */
export function createMcpHandler(identity: IdentityProvider = requireUser, actions = new FormActions()) {
return async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  let userId: string;
  try { userId = await identity(req);
    if (!userId) throw new UnauthorizedError(); }
  catch (error) {
    return new Response(error instanceof UnauthorizedError ? 'Unauthorized' : 'Authentication unavailable',
      { status: error instanceof UnauthorizedError ? 401 : 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const server = buildMcpServer(userId, actions);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  const response = await transport.handleRequest(req);
  response.headers.set('Cache-Control', 'no-store');
  return response;
};
}

export default createMcpHandler();

export const config: Config = {
  path: '/mcp',
  method: ['POST'],
  rateLimit: { aggregateBy: ['ip', 'domain'], windowSize: 60, windowLimit: 60 },
};
