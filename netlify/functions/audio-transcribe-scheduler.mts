import type {Config} from '@netlify/functions';
import {wakeTranscriptionWorker} from '../../src/server/transcriptionService';
export default async function handler(){
 try{
  const accepted=await wakeTranscriptionWorker();
  return Response.json({accepted});
 }catch(e){
  console.warn('Audio transcription scheduler',e instanceof Error?e.name:'unknown');
  return Response.json({accepted:false},{status:503});
 }
}
export const config:Config={schedule:'*/5 * * * *'};
