import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FormActions } from './formActions';

/** Tools are strictly scoped to an authenticated user resolved *before* MCP dispatch. */
export function buildMcpServer(userId: string, actions: FormActions = new FormActions()) {
  const server = new McpServer({ name: 'formulaire-de-singe', version: '0.3.0' });

  server.tool('list_forms', 'List only forms this authenticated user owns or may view. Read-only.',
    { limit: z.number().int().min(1).max(100).optional().describe('Maximum number of forms, default 20') },
    async ({ limit }) => {
      try { return { content: [{ type: 'text', text: JSON.stringify(await actions.list(userId, limit ?? 20)) }] }; }
      catch { return { isError: true, content: [{ type: 'text', text: 'Could not list authorized forms' }] }; }
    });

  server.tool('create_form', 'Create a private draft form owned by the signed-in user. Never publish automatically. WRITE action.',
    { title: z.string().trim().min(1).max(200).describe('New form title, 1 to 200 characters') },
    async ({ title }) => {
      try { return { content: [{ type: 'text', text: JSON.stringify(await actions.create(userId, { title })) }] }; }
      catch { return { isError: true, content: [{ type: 'text', text: 'Could not create the draft form' }] }; }
    });

  server.tool('get_form', 'Read a form, its versions, pages and question structure, only if the authenticated user has access. Read-only.',
    { id: z.string().uuid().describe('UUID of the form to retrieve') },
    async ({ id }) => {
      try { return { content: [{ type: 'text', text: JSON.stringify(await actions.get(userId, id)) }] }; }
      catch { return { isError: true, content: [{ type: 'text', text: 'Form unavailable or access denied' }] }; }
    });
  return server;
}
