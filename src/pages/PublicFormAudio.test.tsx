import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import { MemoryRouter,Route,Routes } from 'react-router-dom';
import {PublicFormPage} from './PublicFormPage';
import type {PublicForm} from '../shared/publicForm';
const questionId='3b53ad7c-af40-4125-82c4-b71ee0c420bf';
const versionId='1a27582a-ed09-4e53-8a0b-780dfb2d1ad8';
const form:PublicForm={id:'form',slug:'vocal',title:'Enquête vocale',description:null,versionId,versionNumber:1,requireConsent:true,pages:[{id:'page1',title:'Votre témoignage',description:null,questions:[{id:questionId,type:'audio',label:'Racontez',description:null,required:true,mode:'audio',maxAudioSeconds:180,maxAudioBytes:10*1024*1024,options:[]}]}]};
class Recorder {
 static isTypeSupported=(s:string)=>s.startsWith('audio/webm');
 state='inactive';mimeType='audio/webm';
 ondataavailable:((e:{data:Blob})=>void)|null=null;onstop:(()=>void)|null=null;
 start(){this.state='recording';}
 stop(){this.state='inactive';this.ondataavailable?.({data:new Blob([new Uint8Array([0x1a,0x45,0xdf,0xa3,1])],{type:'audio/webm'})});this.onstop?.()}
}
const token='f'.repeat(64),fileId='1933a159-03fc-4e39-b273-24912a97261d';
const fetchMock=vi.fn();
beforeEach(()=>{
 vi.stubGlobal('fetch',fetchMock);vi.stubGlobal('scrollTo',vi.fn());vi.stubGlobal('MediaRecorder',Recorder);
 Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=>'blob:preview')});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()});
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>({getTracks:()=>[{stop:vi.fn(),addEventListener:vi.fn()}]})}});
 fetchMock.mockReset();fetchMock.mockImplementation(async (url:string,options?:RequestInit)=>{
  if(!options?.method)return {ok:true,json:async()=>({ok:true,data:form})};
  if(url.includes('/audio/prepare'))return {ok:true,json:async()=>({ok:true,data:{uploadUrl:'https://r2.example.test/private-put',uploadId:fileId,claimToken:token,contentType:'audio/webm'}})};
  if(url.startsWith('https://r2.example.test/'))return {ok:true};
  if(url.includes('/audio/complete'))return {ok:true,json:async()=>({ok:true,data:{verified:true}})};
  if(url.includes('/submissions'))return {ok:true,json:async()=>({ok:true,data:{id:'ok'}})};
  throw new Error('Unknown route '+url);
 });
});
afterEach(()=>vi.unstubAllGlobals());
function mount(){render(<MemoryRouter initialEntries={['/f/vocal']}><Routes><Route path="/f/:slug" element={<PublicFormPage/>}/></Routes></MemoryRouter>);}
async function record(){
 fireEvent.click(await screen.findByRole('button',{name:/Commencer l’enregistrement/i}));
 fireEvent.click(await screen.findByRole('button',{name:/Arrêter l’enregistrement/i}));
 await screen.findByRole('button',{name:/Supprimer/i});
}
describe('Parcours audio public',()=>{
 it('transfère le fichier avant la soumission et ne transmet qu’une référence',async()=>{
  mount();await record();fireEvent.click(screen.getByLabelText(/J’accepte de participer/i));
  fireEvent.click(screen.getByRole('button',{name:/Envoyer mes réponses/i}));
  await waitFor(()=>expect(screen.getByText(/Merci pour votre participation/i)).toBeInTheDocument());
  const urls=fetchMock.mock.calls.map(c=>c[0]);
  const ix=urls.findIndex((u:string)=>u.includes('/audio/prepare'));
  expect(urls[ix+1]).toBe('https://r2.example.test/private-put');
  expect(urls[ix+2]).toContain('/audio/complete');
  expect(urls[ix+3]).toContain('/submissions');
  const submit=JSON.parse(fetchMock.mock.calls[ix+3][1].body);
  expect(submit.answers[0].value).toEqual({kind:'audio',uploadId:fileId,claimToken:token});
  expect(JSON.stringify(submit)).not.toContain('blob:preview');
 });
 it('ne transfère jamais un audio si la personne refuse son consentement',async()=>{
  mount();await record();fireEvent.click(screen.getByRole('button',{name:/Je ne souhaite pas participer/i}));
  expect(screen.getByText(/Choix respecté/i)).toBeInTheDocument();
  expect(fetchMock.mock.calls.filter(c=>c[1]?.method)).toHaveLength(0);
 });
 it('arrête la collecte quand R2 renvoie une erreur réseau',async()=>{
  fetchMock.mockImplementation(async (url:string,opts?:RequestInit)=>{
   if(!opts?.method)return {ok:true,json:async()=>({ok:true,data:form})};
   if(url.includes('prepare'))return {ok:true,json:async()=>({ok:true,data:{uploadUrl:'https://r2.example.test/private-put',uploadId:fileId,claimToken:token,contentType:'audio/webm'}})};
   if(url.startsWith('https://r2.example.test/'))return {ok:false,status:503};
   throw new Error('Submission should not be reached');
  });
  mount();await record();fireEvent.click(screen.getByLabelText(/J’accepte de participer/i));
  fireEvent.click(screen.getByRole('button',{name:/Envoyer mes réponses/i}));
  expect(await screen.findByRole('alert')).toHaveTextContent(/transfert audio a échoué/i);
  expect(fetchMock.mock.calls.filter(c=>String(c[0]).includes('/submissions'))).toHaveLength(0);
 });
});
