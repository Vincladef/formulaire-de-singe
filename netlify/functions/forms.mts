import type { Config } from '@netlify/functions';
import { createRestHandler } from '../../src/server/restApi';

export default createRestHandler();

export const config: Config = {
  path: ['/api/forms', '/api/forms/:id', '/api/forms/:id/draft', '/api/forms/:id/publish', '/api/forms/:id/state', '/api/forms/:id/duplicate'],
  method: ['GET', 'POST', 'PATCH', 'PUT'],
  rateLimit: { aggregateBy: ['ip', 'domain'], windowSize: 60, windowLimit: 60 },
};
