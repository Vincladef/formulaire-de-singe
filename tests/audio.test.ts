import { describe,it,expect,vi } from 'vitest';
import { audioSignature,audioMode,audioLimits,audioPrepareSchema,MAX_AUDIO_BYTES } from '../src/shared/audio';
import { validateAnswers,toSubmissionAnswers,type PublicForm } from '../src/shared/publicForm';
import { createAudioRestHandler } from '../src/server/audioRestApi';
import { AudioFault,type AudioService } from '../src/server/audioService';

const ids={version:'3a404c4a-78cc-4ab4-a7f8-90f8e64e9337',question:'dd793db4-5923-433d-8f6c-9715da0ea8a0',nonce:'0a0a3656-bade-4a19-8490-0c59de877aea',file:'c691ddc0-1651-4f89-b112-a07e900713a8'};
const form:PublicForm={id:'37d43ab6-cd5a-49e4-a84d-7b4c18f1dce7',title:'Test',slug:'demo',description:null,versionId:ids.version,versionNumber:1,requireConsent:true,pages:[{
 id:'p1',title:'La page',description:null,questions:[{id:ids.question,type:'long_text',label:'Racontez',description:null,required:true,options:[],mode:'either',maxAudioSeconds:120,maxAudioBytes:MAX_AUDIO_BYTES}]
}]};
const token='a'.repeat(64);
const mockService:AudioService={
 prepare:vi.fn(async()=>({uploadId:ids.file,claimToken:token,uploadUrl:'https://example.r2.cloudflarestorage.com/object?signature=secret',contentType:'audio/webm',expiresIn:120})),
 complete:vi.fn(async()=>({uploadId:ids.file,verified:true})),
 access:vi.fn(async()=>({url:'https://example.r2.cloudflarestorage.com/object?signature=secret',expiresIn:60})),
};
const handler=createAudioRestHandler(mockService,async()=> 'owner-1');
const request=(path:string,method='POST',body?:unknown,headers:Record<string,string>={'content-type':'application/json'})=>handler(new Request('https://app.example'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}));

describe('Validation de l’audio',()=>{
 it('accepte une réponse textuelle ou un audio vérifié, jamais les deux pour la même question',()=>{
  expect(validateAnswers(form,{[ids.question]:'Une réponse'})).toEqual({});
  const audio={kind:'audio' as const,uploadId:ids.file,claimToken:token};
  expect(validateAnswers(form,{[ids.question]:audio})).toEqual({});
  expect(toSubmissionAnswers(form,{[ids.question]:audio})[0].value).toEqual(audio);
  expect(validateAnswers(form,{[ids.question]:''})[ids.question]).toMatch(/obligatoire/);
 });
 it('vérifie les limites et les formats prévus',()=>{
  const valid={versionId:ids.version,questionId:ids.question,clientNonce:ids.nonce,consent:true,mimeType:'audio/webm',byteSize:2048,durationMs:12000};
  expect(audioPrepareSchema.safeParse(valid).success).toBe(true);
  expect(audioPrepareSchema.safeParse({...valid,byteSize:16_000_000}).success).toBe(false);
  expect(audioPrepareSchema.safeParse({...valid,consent:false}).success).toBe(false);
  expect(audioMode('long_text',{answerMode:'either'})).toBe('either');
  expect(audioLimits({maxAudioSeconds:999}).maxSeconds).toBe(300);
  expect(audioSignature(new Uint8Array([0x1a,0x45,0xdf,0xa3]),'audio/webm')).toBe(true);
  expect(audioSignature(new Uint8Array([0,0,0,0]),'audio/webm')).toBe(false);
 });
});
describe('API des transferts audio',()=>{
 const data={versionId:ids.version,questionId:ids.question,clientNonce:ids.nonce,consent:true,mimeType:'audio/webm',byteSize:2048,durationMs:12000};
 it('prépare et vérifie un transfert sans connexion et renvoie une URL limitée',async()=>{
  const prepare=await request('/api/public/forms/demo/audio/prepare','POST',data);
  expect(prepare.status).toBe(201);expect((await prepare.json()).data.expiresIn).toBe(120);
  const complete=await request('/api/public/forms/demo/audio/complete','POST',{uploadId:ids.file,claimToken:token,clientNonce:ids.nonce});
  expect(complete.status).toBe(200);expect((await complete.json()).data.verified).toBe(true);
 });
 it('refuse les données invalides et le refus de consentement',async()=>{
  expect((await request('/api/public/forms/demo/audio/prepare','POST',{...data,consent:false})).status).toBe(400);
  expect((await request('/api/public/forms/demo/audio/prepare','POST',{...data,byteSize:MAX_AUDIO_BYTES+1})).status).toBe(400);
 });
 it('n’autorise pas une écoute sans authentification',async()=>{
  const privateHandler=createAudioRestHandler(mockService,async()=>{throw new (await import('../src/server/auth')).UnauthorizedError()});
  const response=await privateHandler(new Request('https://example.com/api/audio/'+ids.file));
  expect(response.status).toBe(401);
 });
 it('retourne un lien de lecture de courte durée après autorisation',async()=>{
  const response=await request('/api/audio/'+ids.file,'GET',undefined,{});
  expect(response.status).toBe(200);expect((await response.json()).data.expiresIn).toBe(60);
 });
 it('ne divulgue pas les erreurs serveur',async()=>{
  const failing=createAudioRestHandler({...mockService,prepare:async()=>{throw new Error('R2_SECRET_ACCESS_KEY=hidden')}});
  const response=await failing(new Request('https://example.com/api/public/forms/demo/audio/prepare',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)}));
  expect(response.status).toBe(503);expect(JSON.stringify(await response.json())).not.toContain('hidden');
 });
 it('remonte des erreurs compréhensibles sur les fichiers rejetés',async()=>{
  const failing=createAudioRestHandler({...mockService,complete:async()=>{throw new AudioFault(422,'INVALID_AUDIO','Fichier rejeté.')}});
  const response=await failing(new Request('https://example.com/api/public/forms/demo/audio/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({uploadId:ids.file,claimToken:token,clientNonce:ids.nonce})}));
  expect(response.status).toBe(422);
 });
});
