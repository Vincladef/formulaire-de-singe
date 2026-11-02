import type { Config } from '@netlify/functions';
import { syncGoogleSheets } from '../../src/server/sheetsService';

// Runs every two minutes; stored deliveries survive outages and failed API calls.
export default async ()=>{
 try{
  const result=await syncGoogleSheets(15);
  console.info('Sheets sync',result);
  return Response.json(result);
 }catch(error){
  console.error('Sheets scheduled sync failed',error instanceof Error?error.name:'Unknown');
  return Response.json({ok:false},{status:503});
 }
};
export const config:Config={schedule:'*/2 * * * *'};
