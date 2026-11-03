import type { Config,Context } from '@netlify/functions';
import { sheetsRestHandler } from '../../src/server/sheetsRestApi';
import { syncGoogleSheets } from '../../src/server/sheetsService';

export default (request:Request,context:Context)=>sheetsRestHandler(request,formId=>{
 // Create/backfill the first rows without delaying the Google authorization redirect.
 context.waitUntil(syncGoogleSheets(20,formId).catch(error=>
  console.error('Google Sheets initial backfill',error instanceof Error?error.name:'Unknown')));
});
export const config:Config={
 path:['/api/integrations/google/callback','/api/integrations/google/:formId',
  '/api/integrations/google/:formId/start','/api/integrations/google/:formId/retry',
  '/api/integrations/google/:formId/sync'],
 method:['GET','POST','DELETE'],
};
