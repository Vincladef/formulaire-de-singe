import type { Config } from '@netlify/functions';
import { audioRestHandler } from '../../src/server/audioRestApi';

export default audioRestHandler;
// Short recordings use one function invocation; maintain an independent IP cap.
export const config:Config={
 path:'/api/public/forms/:slug/audio/direct',
 method:['POST'],
 rateLimit:{windowSize:60,windowLimit:45,aggregateBy:['ip','domain']},
};
