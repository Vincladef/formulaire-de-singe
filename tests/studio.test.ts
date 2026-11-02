import { describe,expect,it } from 'vitest';
import {draftPayloadSchema,makePage,makeQuestion,duplicateQuestion,duplicatePages,moveQuestionAt,questionTypes} from '../src/shared/studio';

const versionId='1f8bcdb4-8e77-4700-bcb3-4f06f0d6605b';
describe('Schémas Studio',()=>{
 it('accepte une page avec chacune des neuf familles de questions',()=>{
   const page=makePage();page.questions=questionTypes.map(makeQuestion);
   const parsed=draftPayloadSchema.parse({versionId,expectedRevision:0,pages:[page]});
   expect(parsed.pages[0].questions).toHaveLength(9);
 });
 it('rejette les IDs répétés et un choix vide',()=>{
   const page=makePage();const q=makeQuestion('single_choice');page.questions=[q,q];
   expect(draftPayloadSchema.safeParse({versionId,expectedRevision:0,pages:[page]}).success).toBe(false);
   page.questions=[{...q,options:[]}];
   expect(draftPayloadSchema.safeParse({versionId,expectedRevision:0,pages:[page]}).success).toBe(false);
 });
 it('conserve toutes les questions lors d’un déplacement',()=>{
   expect(moveQuestionAt(['a','b','c'],0,2)).toEqual(['b','c','a']);
   expect(moveQuestionAt(['a','b','c'],2,0)).toEqual(['c','a','b']);
 });
 it('duplique sans réutiliser les identifiants',()=>{
   const q=makeQuestion('multiple_choice');const d=duplicateQuestion(q);
   expect(d.id).not.toBe(q.id);expect(d.options.map(o=>o.id)).not.toEqual(q.options.map(o=>o.id));
   const p=makePage();p.questions=[q];const copy=duplicatePages([p]);
   expect(copy[0].id).not.toBe(p.id);expect(copy[0].questions[0].id).not.toBe(q.id);
 });
});
