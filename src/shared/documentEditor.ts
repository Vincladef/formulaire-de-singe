import { makeQuestion, type QuestionType, type StudioPageData, type StudioQuestion } from './studio';

/** Positions are relative to a page, never to the current viewport. */
export type EditorAnchor = { questionId: string; offset?: number; text?: string };
export type InsertResult = { questions: StudioQuestion[]; insertedId: string };

/** Inserts at the last textual caret, splitting an explanatory paragraph if necessary.
 * Existing question ids never change, so collected answers remain associated with their fields.
 */
export function insertAtAnchor(questions: readonly StudioQuestion[], type: QuestionType, anchor?: EditorAnchor | null): InsertResult {
 const inserted = makeQuestion(type);
 if(type === 'statement') inserted.label = 'Votre texte ici…';
 if(!anchor) return {questions: [...questions, inserted], insertedId: inserted.id};
 const index = questions.findIndex(q => q.id === anchor.questionId);
 if(index < 0) return {questions: [...questions, inserted], insertedId: inserted.id};
 const current=questions[index];
 if(current.type !== 'statement' || anchor.offset === undefined) {
   const next = [...questions]; next.splice(index+1,0,inserted);
   return {questions:next,insertedId:inserted.id};
 }
 const raw = anchor.text ?? current.label;
 const offset = Math.max(0,Math.min(raw.length,anchor.offset));
 const before = raw.slice(0,offset).trim();
 const after = raw.slice(offset).trim();
 const next=[...questions];
 if(before && after){
   const tail={...makeQuestion('statement'),label:after,settings:{...current.settings}};
   next.splice(index,1,{...current,label:before},inserted,tail);
 } else if(before) {
   next.splice(index,1,{...current,label:before},inserted);
 } else if(after) {
   next.splice(index,1,inserted,{...current,label:after});
 } else {
   next.splice(index,1,inserted);
 }
 return {questions:next,insertedId:inserted.id};
}
export function insertInPage(pages:readonly StudioPageData[],pageIndex:number,type:QuestionType,anchor?:EditorAnchor|null){
 return pages.map((page,index)=> index!==pageIndex?page:{...page,questions:insertAtAnchor(page.questions,type,anchor).questions});
}
