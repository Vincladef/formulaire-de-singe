import type { Config } from '@netlify/functions';
import { createMcpOAuthHandler } from '../../src/server/mcpOAuthRestApi';

export default createMcpOAuthHandler();
export const config:Config={
 path:[
  '/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp',
  '/.well-known/oauth-authorization-server','/.well-known/oauth-authorization-server/mcp',
  '/oauth/authorize','/oauth/token',
  '/api/mcp/consent','/api/mcp/connections','/api/mcp/connections/:id',
 ],
 method:['GET','POST','DELETE'],
 rateLimit:{aggregateBy:['ip','domain'],windowSize:60,windowLimit:60},
};
