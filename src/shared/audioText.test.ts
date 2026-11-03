import { describe, expect, it } from 'vitest';
import { isAnswered, toSubmissionAnswers, validateAnswers, type PublicForm } from './publicForm';
import { uploadedAudioSchema } from './audio';

const id='11111111-1111-4111-8111-111111111111';
const token='a'.repeat(64);
function form(allowTextSupplement:boolean):PublicForm {
 return {
  id:'form',slug:'demo',title:'Test',description:null,versionId:'version',versionNumber:1,requireConsent:false,
  pages:[{id:'page',title:'Page',description:null,questions:[{
   id,type:'audio',label:'Racontez',description:null,required:true,options:[],mode:'audio',
   settings:{allowTextSupplement},
  }]}],
 };
}
describe('Réponses audio et écrites',()=>{
 it('autorise le texte seul lorsque la variante est activée',()=>{
  expect(validateAnswers(form(true),{[id]:'Une réponse écrite'})).toEqual({});
  expect(isAnswered('Une réponse écrite')).toBe(true);
  expect(validateAnswers(form(false),{[id]:'Une réponse écrite'})[id]).toBeTruthy();
  expect(validateAnswers(form(true),{[id]:'x'.repeat(501)})[id]).toBeTruthy();
 });
 it('conserve le texte avec le ticket audio, sans inclure le fichier local',()=>{
  const uploaded={kind:'audio' as const,uploadId:'22222222-2222-4222-8222-222222222222',claimToken:token,text:'Un complément'};
  expect(uploadedAudioSchema.parse(uploaded)).toEqual(uploaded);
  expect(validateAnswers(form(true),{[id]:uploaded})).toEqual({});
  expect(validateAnswers(form(false),{[id]:uploaded})[id]).toBeTruthy();
  expect(toSubmissionAnswers(form(true),{[id]:uploaded})).toEqual([{questionId:id,value:uploaded}]);
 });
 it('refuse un champ obligatoire sans réponse et garde les brouillons à part',()=>{
  expect(validateAnswers(form(true),{})[id]).toBeTruthy();
  expect(toSubmissionAnswers(form(true),{[id]:{
   kind:'audio-draft',file:new Blob(['ID3test'],{type:'audio/mpeg'}),durationMs:1000,text:'Un complément',
  }})).toEqual([]);
 });
});
