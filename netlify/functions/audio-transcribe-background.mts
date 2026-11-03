import {verifyTranscriptionWorkerRequest,runTranscriptionQueue} from '../../src/server/transcriptionService';
/** Netlify asynchronous background function (up to fifteen minutes). */
export default async function handler(request:Request){
 if(request.method!=='POST'||!verifyTranscriptionWorkerRequest(request))
  return Response.json({ok:false},{status:403});
 try{
  const result=await runTranscriptionQueue();
  console.info('Audio transcription processed', {claimed:result.claimed,done:result.done,failed:result.failed});
  return Response.json({ok:true,result});
 }catch(error){
  console.error('Audio transcription job',error instanceof Error?error.name:'unknown');
  return Response.json({ok:false},{status:503});
 }
}
