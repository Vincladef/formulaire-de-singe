import {verifyTranscriptionWorkerRequest,runTranscriptionQueue} from '../../src/server/transcriptionService';
/** Netlify asynchronous background function (up to fifteen minutes). */
export default async function handler(request:Request){
 if(request.method!=='POST'||!verifyTranscriptionWorkerRequest(request))
  return Response.json({ok:false},{status:403});
 try{
  let claimed=0,done=0,failed=0;let quotaReached=false;
  // A batch completes without the visitor staying on the page. The scheduled
  // runner picks up remaining work or retries after the daily free quota resets.
  for(let i=0;i<12;i++){
   const result=await runTranscriptionQueue();
   claimed+=result.claimed;done+=result.done;failed+=result.failed;
   if(result.claimed===0||('quotaReached' in result&&result.quotaReached)){quotaReached='quotaReached' in result&&result.quotaReached===true;break;}
  }
  console.info('Audio transcription processed',{claimed,done,failed,quotaReached});
  return Response.json({ok:true,result:{claimed,done,failed,quotaReached}});
 }catch(error){
  console.error('Audio transcription job',error instanceof Error?error.name:'unknown');
  return Response.json({ok:false},{status:503});
 }
}
