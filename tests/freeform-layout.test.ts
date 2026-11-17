import { describe,expect,it } from 'vitest';
import { freeformDraft, freeformPage, isFreeformMarker, isFreeformPage } from '../src/shared/freeformLayout';
import { draftPayloadSchema, makePage, makeQuestion } from '../src/shared/studio';

describe('Mise en page documentaire libre',()=>{
 it('importe les quatre anciens éléments visibles dans l’ordre sans modifier les questions',()=>{
  const first=makePage();
  first.title='Pour commencer';first.description='Environ 5 minutes';
  const question=makeQuestion('short_text');
  question.label='Question existante';
  first.questions=[question];
  const pages=freeformDraft([first],'Vos courses alimentaires','Texte de présentation existant');
  expect(isFreeformPage(pages[0])).toBe(true);
  const blocks=pages[0].questions.filter(q=>!isFreeformMarker(q));
  expect(blocks.map(q=>q.label)).toEqual([
   'Vos courses alimentaires','Texte de présentation existant','Pour commencer','Environ 5 minutes','Question existante'
  ]);
  expect(blocks.map(q=>q.settings.textStyle).slice(0,4)).toEqual(['display','paragraph','heading','paragraph']);
  expect(blocks[4].id).toBe(question.id);
  expect(draftPayloadSchema.safeParse({versionId:crypto.randomUUID(),expectedRevision:0,pages}).success).toBe(true);
 });
 it('ne duplique jamais un en-tête à la deuxième ouverture',()=>{
  const first=makePage();first.title='Pour commencer';first.description='Texte';
  const once=freeformPage(first,'Formulaire','Présentation',true);
  expect(freeformPage(once,'Formulaire','Présentation',true)).toBe(once);
  expect(once.questions.filter(isFreeformMarker)).toHaveLength(1);
 });
 it('conserve un marqueur invisible même quand la page est vide',()=>{
  const page=freeformPage(makePage());
  expect(page.questions).toHaveLength(1);
  expect(isFreeformMarker(page.questions[0])).toBe(true);
  expect(draftPayloadSchema.safeParse({
   versionId:crypto.randomUUID(),expectedRevision:0,pages:[page]
  }).success).toBe(true);
 });
});
