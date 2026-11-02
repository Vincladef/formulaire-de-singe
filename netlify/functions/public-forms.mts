import type { Config, Context } from '@netlify/functions';
import { createPublicRestHandler } from '../../src/server/publicRestApi';
import { sheetsConfigured, syncGoogleSheets } from '../../src/server/sheetsService';

const handler=createPublicRestHandler();
export default async(request:Request,context:Context)=>{
 const response=await handler(request);
 if(request.method==='POST'&&response.status===201&&sheetsConfigured()){
  // Delivery is never allowed to block or invalidate a successful form submission.
  context.waitUntil(syncGoogleSheets(1).catch(error=>console.error('Sheets post-submit sync',error instanceof Error?error.name:'Unknown')));
 }
 return response;
};

export const config: Config = {
  path: ['/api/public/forms/:slug', '/api/public/forms/:slug/submissions'],
  method: ['GET','POST'],
  rateLimit: {aggregateBy:['ip','domain'],windowSize:60,windowLimit:45},
};
