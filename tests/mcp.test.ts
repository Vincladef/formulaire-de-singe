import { describe, expect, it } from 'vitest';
import { createMcpHandler } from '../netlify/functions/mcp.mts';
import { UnauthorizedError } from '../src/server/auth';
import { FormActions } from '../src/server/formActions';
import type { FormRepository } from '../src/shared/formApi';

const testId = '9d6ea3f9-315c-4c1a-9dc7-4c023d99ef22';
const testDraftId = '08b6e5c1-33ca-4d20-bb0e-c0447daf798a';
const repo: FormRepository = {
  list: async () => [{ id: testId, title: 'Test', slug: 'test', role: 'owner', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() }],
  create: async (_uid, title) => ({ id: testId, title, slug: 'test', draftId: testDraftId }),
  get: async (_uid, id) => id === testId ? { id, title: 'Test', slug: 'test', description: null, role: 'owner', versions: [] } : null,
  rename: async () => null,
};
const handler = createMcpHandler(async (request) => {
  if (request.headers.get('Authorization') !== 'Bearer fictional-test-credential') throw new UnauthorizedError();
  return 'fake-test-user';
}, new FormActions(repo));

function rpc(method: string, params: unknown, id: number) {
  return handler(new Request('https://formulaire-de-singe.netlify.app/mcp', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer fictional-test-credential',
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  }));
}

describe('MCP stateless transport: direct client JSON-RPC', () => {
  it('exige un authentifiant valide', async () => {
    const result = await handler(new Request('https://formulaire-de-singe.netlify.app/mcp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    }));
    expect(result.status).toBe(401);
  });
  it('rejette GET pour éviter les connexions SSE longues en serveur sans état', async () => {
    const result = await handler(new Request('https://formulaire-de-singe.netlify.app/mcp'));
    expect(result.status).toBe(405);
  });
  it('réalise le handshake MCP puis découvre exactement les trois outils autorisés', async () => {
    const hello = await rpc('initialize', {
      protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test-suite', version: '1' },
    }, 1);
    expect(hello.status).toBe(200);
    const hi = await hello.json();
    expect(hi.result.serverInfo.name).toBe('formulaire-de-singe');
    const tools = await rpc('tools/list', {}, 2);
    expect(tools.status).toBe(200);
    const list = await tools.json();
    expect(list.result.tools.map((t: { name: string }) => t.name).sort()).toEqual(['create_form','get_form','list_forms']);
  });
  it('appelle réellement les trois outils sur le service métier simulé, sans Neon', async () => {
    const l = await rpc('tools/call', { name: 'list_forms', arguments: {} }, 3);
    expect(l.status).toBe(200);
    expect(JSON.stringify(await l.json())).toContain(testId);
    const c = await rpc('tools/call', { name: 'create_form', arguments: { title: 'Mon étude' } }, 4);
    expect(c.status).toBe(200);
    expect(JSON.stringify(await c.json())).toContain('Mon étude');
    const g = await rpc('tools/call', { name: 'get_form', arguments: { id: testId } }, 5);
    expect(g.status).toBe(200);
    expect(JSON.stringify(await g.json())).toContain('Test');
  });
});
