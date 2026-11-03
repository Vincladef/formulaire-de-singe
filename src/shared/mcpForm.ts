import { z } from 'zod';
import { draftPayloadSchema, makeQuestion, type StudioPageData, type QuestionType, type DraftPayload, type StudioQuestion } from './studio';
import { OTHER_VALUE } from './publicForm';

/**
 * AI-friendly input contract: no UUIDs needed for new questionnaires.
 * All persistent UUIDs are generated server-side, with strict validation.
 */
export const mcpAnswerType=z.enum(['short_text','long_text','single_choice','multiple_choice','select','number','date','audio','statement']);
export const mcpQuestionSchema=z.object({
 type:mcpAnswerType.describe('short_text, long_text, single_choice, multiple_choice, select, number, date, audio, or statement (instructional text)'),
 label:z.string().trim().min(1).max(10000).describe('Question text or explanatory paragraph. Regular questions max 600 characters.'),
 description:z.string().max(3000).nullable().optional().describe('Optional help text'),
 required:z.boolean().optional().describe('Whether a reply is mandatory. Not applicable to statements.'),
 choices:z.array(z.string().trim().min(1).max(180)).min(2).max(100).optional().describe('Labels for choice questions, at least two; otherwise omit'),
 allowOther:z.boolean().optional().describe('Include an Other/free-text choice'),
 answerMode:z.enum(['text','audio','either']).optional().describe('For text fields: text-only, audio-only or either. Dedicated audio questions are always audio.'),
 maxAudioSeconds:z.number().int().min(15).max(1800).optional().describe('Maximum response duration for audio fields in seconds; default 600'),
 textStyle:z.enum(['paragraph','heading','quote']).optional().describe('For statements only: display as paragraph, heading or quote'),
}).strict().superRefine((q,ctx)=>{
 const choice=['single_choice','multiple_choice','select'].includes(q.type);
 if(choice&&!q.choices)ctx.addIssue({code:'custom',message:'Les questions à choix nécessitent au moins deux options',path:['choices']});
 if(!choice&&q.choices)ctx.addIssue({code:'custom',message:'Options incompatibles avec ce type',path:['choices']});
 if(!choice&&(q.allowOther??false))ctx.addIssue({code:'custom',message:'Autre n’est possible que sur une question à choix',path:['allowOther']});
 if(q.type!=='statement'&&q.label.length>600)ctx.addIssue({code:'custom',message:'Question trop longue (600 caractères maximum)',path:['label']});
 if(q.type==='statement'&&q.required)ctx.addIssue({code:'custom',message:'Un paragraphe ne peut pas être obligatoire',path:['required']});
 if(q.type==='statement'&&(q.answerMode||q.maxAudioSeconds))ctx.addIssue({code:'custom',message:'Un paragraphe explicatif ne peut pas enregistrer une réponse audio'});
 if(q.answerMode&&!['short_text','long_text','audio'].includes(q.type))ctx.addIssue({code:'custom',message:'Mode vocal incompatible avec ce type de réponse',path:['answerMode']});
 if(q.maxAudioSeconds&&!(['short_text','long_text','audio'].includes(q.type)))ctx.addIssue({code:'custom',message:'Durée audio incompatible avec ce type de réponse',path:['maxAudioSeconds']});
 if(q.textStyle&&q.type!=='statement')ctx.addIssue({code:'custom',message:'Le style de texte est réservé aux paragraphes',path:['textStyle']});
 if(choice&&new Set(q.choices?.map(x=>x.toLocaleLowerCase('fr'))).size!==q.choices?.length)
  ctx.addIssue({code:'custom',message:'Choix répétés',path:['choices']});
});
export const mcpPageSchema=z.object({
 title:z.string().trim().max(200).optional().describe('Page heading, optional; omit for a single continuous-looking page'),
 description:z.string().max(3000).nullable().optional().describe('Introduction displayed before the questions'),
 questions:z.array(mcpQuestionSchema).max(150).describe('Order of paragraphs and questions as they should appear in the document'),
}).strict();
export const mcpFormContentSchema=z.object({
 pages:z.array(mcpPageSchema).min(1).max(40).describe('Pages of the questionnaire; one page is usually best'),
}).strict();
export const mcpCreateFormSchema=mcpFormContentSchema.extend({
 title:z.string().trim().min(1).max(200).describe('Name of the form in the owner’s library'),
 folderId:z.string().uuid().nullable().optional().describe('Existing private folder UUID; omit for unfiled'),
}).strict();

export type McpFormContent=z.infer<typeof mcpFormContentSchema>;
export type McpCreateForm=z.infer<typeof mcpCreateFormSchema>;

/** Create a valid draft without exposing database UUID complexity to the user/agent. */
export function compileMcpPages(input:McpFormContent):StudioPageData[]{
 return input.pages.map(page=>{
  const questions:StudioQuestion[]=page.questions.map(item=>{
   const q=makeQuestion(item.type as QuestionType);
   q.label=item.label;
   q.description=item.description??null;
   q.required=item.type==='statement'?false:(item.required??false);
   const settings:Record<string,unknown>={};
   if(item.answerMode)settings.answerMode=item.answerMode;
   if(item.maxAudioSeconds)settings.maxAudioSeconds=item.maxAudioSeconds;
   if(item.textStyle)settings.textStyle=item.textStyle;
   q.settings=settings;
   if(item.choices){
    q.options=item.choices.map((label,index)=>({id:crypto.randomUUID(),value:'option_'+(index+1),label}));
    if(item.allowOther)q.options.push({id:crypto.randomUUID(),value:OTHER_VALUE,label:'Autre'});
   } else q.options=[];
   return q;
  });
  return {id:crypto.randomUUID(),title:page.title??'Nouvelle page',description:page.description??null,questions};
 });
}

export function compiledDraft(input:McpFormContent,versionId:string,expectedRevision:number):DraftPayload{
 const compiled={versionId,expectedRevision,pages:compileMcpPages(input)};
 return draftPayloadSchema.parse(compiled);
}
