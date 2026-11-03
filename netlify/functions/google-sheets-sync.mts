import type { Config } from '@netlify/functions';
import { syncGoogleSheets } from '../../src/server/sheetsService';

// Safety net every 15 minutes; ordinary submissions already trigger immediate asynchronous sync.
export default async ()=>{
 try{
  const result=await syncGoogleSheets(3);
  console.info('Sheets sync',result);
  return Response.json(result);
 }catch(error){
  console.error('Sheets scheduled sync failed',error instanceof Error?error.name:'Unknown');
  return Response.json({ok:false},{status:503});
 }
};
export const config:Config={schedule:'*/15 * * * *'};
