import type {Config} from '@netlify/functions';
import {transcriptionRestHandler} from '../../src/server/transcriptionRestApi';
export default transcriptionRestHandler;
export const config:Config={
 path:['/api/forms/:id/audio-transcription','/api/forms/:id/audio-transcription/run','/api/audio/:id/transcribe'],
 method:['GET','POST'],
 rateLimit:{aggregateBy:['ip','domain'],windowSize:60,windowLimit:50}
};
