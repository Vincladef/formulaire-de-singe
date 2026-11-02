import type { Config } from '@netlify/functions';
import { audioRestHandler } from '../../src/server/audioRestApi';
export default audioRestHandler;
export const config:Config={
 path:['/api/public/forms/:slug/audio/prepare','/api/public/forms/:slug/audio/complete',
 '/api/public/forms/:slug/audio/:id/parts/:index','/api/audio','/api/audio/:id'],
 method:['GET','POST'],
 rateLimit:{windowSize:60,windowLimit:45,aggregateBy:['ip','domain']},
};
