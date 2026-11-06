import { beforeEach,describe,expect,it,vi } from 'vitest';
import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { MemoryRouter,Route,Routes } from 'react-router-dom';
import { PublicFormPage } from './PublicFormPage';
import type { AudioDraft } from '../shared/audio';
import type { PublicForm } from '../shared/publicForm';

vi.mock('../components/AudioRecorder',()=>({
 AudioRecorder:({onChange}:{onChange:(value:AudioDraft)=>void})=>
  <button type="button" onClick={()=>onChange({
   kind:'audio-draft',file:new Blob([new Uint8Array([0x1a,0x45,0xdf,0xa3,0,0,0,0])],{type:'audio/webm'}),durationMs:20000,
  })}>Simuler un audio de 20 secondes</button>,
}));
const questionId='11111111-1111-4111-8111-111111111111';
const uploadId='22222222-2222-4222-8222-222222222222';
const claimToken='a'.repeat(64);
const form:PublicForm={
 id:'form',title:'Enquête sonore',slug:'test-audio',description:null,versionId:'33333333-3333-4333-8333-333333333333',
 versionNumber:1,requireConsent:false,
 pages:[{id:'page',title:'Page',description:null,questions:[{
  id:questionId,label:'Votre retour ?',type:'audio',description:null,required:true,options:[],mode:'audio',
  settings:{allowTextSupplement:true},maxAudioBytes:15*1024*1024,maxAudioSeconds:600,
 }]}],
};
const fetchMock=vi.fn();
beforeEach(()=>{
 vi.restoreAllMocks();fetchMock.mockReset();vi.stubGlobal('fetch',fetchMock);
 fetchMock.mockImplementation(async(path:string,options?:RequestInit)=>{
  if(path.endsWith('/audio/direct'))return {ok:true,status:201,json:async()=>({ok:true,data:{kind:'audio',uploadId,claimToken}})};
  if(path.endsWith('/submissions'))return {ok:true,status:201,json:async()=>({ok:true,data:{id:'success'}})};
  if(options?.method==='POST')throw Error('Unexpected multipart request');
  return {ok:true,status:200,json:async()=>({ok:true,data:form})};
 });
 vi.stubGlobal('scrollTo',vi.fn());
});
describe('Transfert direct des audios courts',()=>{
 it('envoie un petit fichier sans prepare/parts/complete et conserve le texte associé',async()=>{
  render(<MemoryRouter initialEntries={['/f/test-audio']}><Routes>
   <Route path="/f/:slug" element={<PublicFormPage/>}/></Routes></MemoryRouter>);
  expect(await screen.findByText('Enquête sonore')).toBeInTheDocument();
  expect(screen.getByLabelText('Réponse écrite complémentaire').closest('[hidden]')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Afficher le texte facultatif'}));
  expect(screen.getByLabelText('Réponse écrite complémentaire').closest('[hidden]')).toBeNull();
  fireEvent.change(screen.getByLabelText('Réponse écrite complémentaire'),{target:{value:'Un commentaire'}});
  fireEvent.click(screen.getByRole('button',{name:'Masquer le texte facultatif'}));
  expect(screen.getByLabelText('Réponse écrite complémentaire').closest('[hidden]')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Simuler un audio de 20 secondes'}));
  await waitFor(()=>expect(fetchMock.mock.calls.some(c=>String(c[0]).endsWith('/audio/direct'))).toBe(true));
  const direct=fetchMock.mock.calls.find(c=>String(c[0]).endsWith('/audio/direct'));
  if(!direct)throw new Error('Aucun transfert direct constaté');
  expect(direct[1].headers['x-audio-duration-ms']).toBe('20000');
  expect(direct[1].body.size).toBeLessThan(3*1024*1024);
  fireEvent.click(screen.getByRole('button',{name:/Envoyer mes réponses/i}));
  expect(await screen.findByText(/Merci pour votre participation/i)).toBeInTheDocument();
  const submission=fetchMock.mock.calls.find(c=>String(c[0]).endsWith('/submissions'));
  if(!submission)throw new Error('Aucune soumission constatée');
  expect(JSON.parse(submission[1].body).answers).toEqual([{questionId,value:{
   kind:'audio',uploadId,claimToken,text:'Un commentaire',
  }}]);
  expect(fetchMock.mock.calls.filter(c=>/audio\/(prepare|complete)|\/parts\//.test(String(c[0])))).toHaveLength(0);
 });
});
