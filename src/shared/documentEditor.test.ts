import { describe,expect,it } from 'vitest';
import { insertAtAnchor } from './documentEditor';
import { makeQuestion } from './studio';

describe('insertion à la position du curseur',()=>{
 it('insère entre deux parties de texte sans perdre les identifiants',()=>{
  const text={...makeQuestion('statement'),label:'Bonjour monde'};
  const other=makeQuestion('short_text');
  const result=insertAtAnchor([text,other],'single_choice',{questionId:text.id,offset:8});
  expect(result.questions.map(q=>q.type)).toEqual(['statement','single_choice','statement','short_text']);
  expect(result.questions[0].id).toBe(text.id);
  expect(result.questions[0].label).toBe('Bonjour');
  expect(result.questions[2].label).toBe('monde');
  expect(result.questions[3].id).toBe(other.id);
 });
 it('insère une question après le champ sélectionné',()=>{
  const field=makeQuestion('audio');const result=insertAtAnchor([field],'long_text',{questionId:field.id});
  expect(result.questions.map(q=>q.type)).toEqual(['audio','long_text']);
 });
 it('insère avant un paragraphe quand le curseur est au début',()=>{
  const p={...makeQuestion('statement'),label:'Introduction'};
  const result=insertAtAnchor([p],'date',{questionId:p.id,offset:0});
  expect(result.questions[0].type).toBe('date');
  expect(result.questions[1].id).toBe(p.id);
 });
 it('ajoute à la fin quand aucun point d’insertion n’est connu',()=>{
  const p=makeQuestion('short_text');expect(insertAtAnchor([p],'audio').questions[1].type).toBe('audio');
 });
});
