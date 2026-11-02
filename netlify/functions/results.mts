import type { Config } from '@netlify/functions';
import { createResultsRestHandler } from '../../src/server/resultsRestApi';
export default createResultsRestHandler();
export const config:Config={
 path:[
  '/api/forms/:id/results',
  '/api/forms/:id/results/submissions/:submissionId',
  '/api/forms/:id/results/submissions/:submissionId/delete',
  '/api/forms/:id/results/questions/:questionId',
  '/api/forms/:id/results/audios/:audioId/transcript',
  '/api/forms/:id/results/export/:format',
 ],
 method:['GET','POST','PUT'],
 rateLimit:{windowSize:60,windowLimit:45,aggregateBy:['ip','domain']},
};
