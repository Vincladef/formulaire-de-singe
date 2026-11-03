import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {createHmac} from 'node:crypto';
import {getDb} from '../src/server/db/client';
import {getStore} from '@netlify/blobs';
import {transcriptionConfigured,verifyTranscriptionWorkerRequest,wakeTranscriptionWorker,
 requestAudioTranscription,runTranscriptionQueue,TranscriptionFault} from '../src/server/transcriptionService';

vi.mock('../src/server/db/client',()=>({getDb:vi.fn()}));
vi.mock('@netlify/blobs',()=>({getStore:vi.fn()}));

const previousToken=process.env.CLOUDFLARE_WORKERS_AI_TOKEN;
const previousAccount=process.env.CLOUDFLARE_ACCOUNT_ID;
const previousUrl=process.env.URL;
const sample='11111111-1111-4111-8111-111111111111';

describe('Transcription Cloudflare gratuite',()=>{
 beforeEach(()=>{
  process.env.CLOUDFLARE_WORKERS_AI_TOKEN='test-workers-ai-token-not-real';
  process.env.CLOUDFLARE_ACCOUNT_ID='aa2a68ea074cf19c6bc5157b643363d8';
  process.env.URL='https://monk-form.netlify.app';
  vi.mocked(getDb).mockReset();
  vi.mocked(getStore).mockReset();
 });
 afterEach(()=>{
  vi.unstubAllGlobals();
  if(previousToken===undefined)delete process.env.CLOUDFLARE_WORKERS_AI_TOKEN;
  else process.env.CLOUDFLARE_WORKERS_AI_TOKEN=previousToken;
  if(previousAccount===undefined)delete process.env.CLOUDFLARE_ACCOUNT_ID;
  else process.env.CLOUDFLARE_ACCOUNT_ID=previousAccount;
  if(previousUrl===undefined)delete process.env.URL;
  else process.env.URL=previousUrl;
 });
 it('n’active pas le moteur sans ses secrets serveur',()=>{
  expect(transcriptionConfigured()).toBe(true);
  delete process.env.CLOUDFLARE_WORKERS_AI_TOKEN;
  expect(transcriptionConfigured()).toBe(false);
 });
 it('refuse un déclenchement interne non signé ou expiré',()=>{
  expect(verifyTranscriptionWorkerRequest(new Request('https://monk-form.netlify.app'))).toBe(false);
  const expired=String(Date.now()-3600000);
  const signature=createHmac('sha256',process.env.CLOUDFLARE_WORKERS_AI_TOKEN!)
   .update('monk-audio-transcribe:'+expired).digest('hex');
  expect(verifyTranscriptionWorkerRequest(new Request('https://monk-form.netlify.app',{
   headers:{'x-monk-timestamp':expired,'x-monk-signature':signature}
  }))).toBe(false);
 });
 it('signe une requête de traitement sans exposer la clé au navigateur',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({status:202,ok:true}));
  expect(await wakeTranscriptionWorker()).toBe(true);
  const [url,options]=vi.mocked(fetch).mock.calls[0];
  expect(String(url)).toContain('/.netlify/functions/audio-transcribe-background');
  const req=new Request(String(url),{method:'POST',headers:options?.headers});
  expect(verifyTranscriptionWorkerRequest(req)).toBe(true);
  expect(JSON.stringify(options)).not.toContain(process.env.CLOUDFLARE_WORKERS_AI_TOKEN!);
 });
 it('rejette un identifiant audio invalide avant tout accès aux données',async()=>{
  await expect(requestAudioTranscription('owner','not-an-id')).rejects.toMatchObject({status:400});
  expect(getDb).not.toHaveBeenCalled();
 });
 it('refuse la transcription manuelle aux autres utilisateurs',async()=>{
  const execute=vi.fn().mockResolvedValue({rows:[]});
  vi.mocked(getDb).mockReturnValue({execute} as never);
  await expect(requestAudioTranscription('intruder',sample)).rejects.toMatchObject({status:404});
  expect(execute).toHaveBeenCalledTimes(1);
 });
 it('ne déclenche aucun modèle quand la file est vide',async()=>{
  const execute=vi.fn().mockResolvedValue({rows:[]});
  vi.mocked(getDb).mockReturnValue({execute} as never);
  const result=await runTranscriptionQueue();
  expect(result).toMatchObject({claimed:0,done:0});
  expect(execute).toHaveBeenCalledTimes(2);
  expect(getStore).not.toHaveBeenCalled();
 });
});
