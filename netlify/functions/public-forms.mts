import type { Config } from '@netlify/functions';
import { createPublicRestHandler } from '../../src/server/publicRestApi';

export default createPublicRestHandler();

export const config: Config = {
  path: ['/api/public/forms/:slug', '/api/public/forms/:slug/submissions'],
  method: ['GET','POST'],
  rateLimit: {aggregateBy:['ip','domain'],windowSize:60,windowLimit:45},
};
