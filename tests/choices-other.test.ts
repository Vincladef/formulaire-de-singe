import { describe,expect,it } from 'vitest';
import { isValidOptionAnswer,validateAnswers,type PublicForm } from '../src/shared/publicForm';

const options=[{value:'sport',label:'Sport'},{value:'lecture',label:'Lecture'},{value:'__other__',label:'Autre'}];
const id=crypto.randomUUID();
const form:PublicForm={id:crypto.randomUUID(),slug:'test',title:'Test',description:null,
 versionId:crypto.randomUUID(),versionNumber:1,requireConsent:false,pages:[{
  id:crypto.randomUUID(),title:'Page',description:null,questions:[{
   id,type:'multiple_choice',label:'Votre loisir ?',description:null,required:true,options,
  }],
 }]};
describe('Choix Autre et saisie libre',()=>{
 it('accepte une précision libre uniquement lorsque l’option Autre existe',()=>{
  expect(isValidOptionAnswer('__other__:Cinéma',options)).toBe(true);
  expect(isValidOptionAnswer('__other__:Cinéma',options.slice(0,2))).toBe(false);
  expect(isValidOptionAnswer('__other__:',options)).toBe(false);
  expect(isValidOptionAnswer('__other__:  ',options)).toBe(false);
  expect(isValidOptionAnswer('__other__:'+'x'.repeat(301),options)).toBe(false);
 });
 it('valide une réponse à choix multiples avec précision Autre',()=>{
  expect(validateAnswers(form,{[id]:['sport','__other__:Cinéma']})).toEqual({});
  expect(validateAnswers(form,{[id]:['sport','__other__:']} )[id]).toMatch(/options proposées/);
 });
 it('ne laisse pas passer deux fois la même réponse',()=>{
  expect(validateAnswers(form,{[id]:['sport','sport']})[id]).toBeDefined();
 });
});
