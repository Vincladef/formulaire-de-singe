import type { Config } from '@netlify/functions';
import { createAudioRestHandler } from '../../src/server/audioRestApi';
export default createAudioRestHandler();
export const config:Config={
 path:['/api/public/forms/:slug/audio/prepare','/api/public/forms/:slug/audio/complete','/api/audio/:id'],
 method:['GET','POST'],
 rateLimit:{windowSize:60,windowLimit:35,aggregateBy:['ip','domain']},
};
