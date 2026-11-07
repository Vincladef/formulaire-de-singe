import { z } from 'zod';
import { draftPayloadSchema, makeQuestion, type StudioPageData, type QuestionType, type DraftPayload, type StudioQuestion } from './studio';
import { OTHER_VALUE } from './publicForm';
import { logicKey, type LogicCondition, type LogicGroup } from './conditionalLogic';

/**
 * AI-friendly input contract: no UUIDs needed for new questionnaires.
 * All persistent UUIDs are generated server-side, with strict validation.
 */
export const mcpAnswerType=z.enum(['short_text','long_text','single_choice','multiple_choice','select','number','date','audio','statement']);
const mcpConditionSchema=z.object({
 sourcePage:z.number().int().min(0).max(39).describe('0-based page index of a previous question'),
 sourceQuestion:z.number().int().min(0).max(149).describe('0-based question index on that page'),
 operator:z.enum(['equals','not_equals','contains','not_contains','is_empty','not_empty','greater_than','less_than']),
 value:z.string().max(300).optional().describe('Choice label or value, or text/number to compare; omit for is_empty and not_empty'),
}).strict();
const mcpGroupSchema=z.object({match:z.enum(['all','any']).default('all'),conditions:z.array(mcpConditionSchema).min(1).max(20)}).strict();
const mcpLogicSchema=z.object({
 visibility:mcpGroupSchema.extend({action:z.enum(['show','hide'])}).optional(),
 requiredWhen:mcpGroupSchema.optional(),
 branch:mcpGroupSchema.extend({targetPage:z.union([z.number().int().min(0).max(39),z.literal('end')])}).optional(),
}).strict();
const httpsUrl=z.string().url().max(2048).refine(v=>v.startsWith('https://'),{
 message:'Utilisez une URL HTTPS publique',
});
export const mcpChoiceSchema=z.union([
 z.string().trim().min(1).max(180),
 z.object({
  label:z.string().trim().min(1).max(180),
  imageUrl:httpsUrl.optional().describe('Image publique HTTPS affichée directement dans la carte'),
  price:z.string().trim().min(1).max(80).optional().describe('Ex. Gratuit, 5 €, ou Tarif à confirmer'),
  priceNote:z.string().max(200).optional().describe('Ex. Sur réservation, achat facultatif'),
  date:z.string().max(120).optional(),
  venue:z.string().max(160).optional(),
  summary:z.string().max(600).optional().describe('Description visible sur la carte'),
  url:httpsUrl.optional().describe('Lien officiel vers la sortie ou les réservations'),
 }).strict(),
]);
export const mcpQuestionSchema=z.object({
 type:mcpAnswerType.describe('short_text, long_text, single_choice, multiple_choice, select, number, date, audio, or statement (instructional text)'),
 label:z.string().trim().min(1).max(10000).describe('Question text or explanatory paragraph. Regular questions max 600 characters.'),
 description:z.string().max(3000).nullable().optional().describe('Optional help text'),
 required:z.boolean().optional().describe('Whether a reply is mandatory. Not applicable to statements.'),
 choices:z.array(mcpChoiceSchema).min(2).max(100).optional().describe('Options simples ou cartes riches avec imageUrl, price, priceNote, date, venue, summary, url. Pour les sorties, utilise les objets.'),
 allowOther:z.boolean().optional().describe('Include an Other/free-text choice'),
 answerMode:z.enum(['text','audio','either']).optional().describe('For text fields: text-only, audio-only or either. Dedicated audio questions are always audio.'),
 maxAudioSeconds:z.number().int().min(15).max(1800).optional().describe('Maximum response duration for audio fields in seconds; default 600'),
 allowTextSupplement:z.boolean().optional().describe('For audio questions: allow a discreet optional written supplement; audio stays the primary input'),
 textStyle:z.enum(['paragraph','heading','quote']).optional().describe('For statements only: display as paragraph, heading or quote'),
 richHtml:z.string().max(250000).optional().describe('Optional rich HTML in a statement, including allowed embedded data:image/jpeg/png/webp; sanitized when displayed'),
 logic:mcpLogicSchema.optional().describe('Optional conditional visibility, dynamic requiredness, and branching rules with 0-based question/page references'),
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
 if(q.allowTextSupplement!==undefined&&q.type!=='audio')ctx.addIssue({code:'custom',message:'Le supplément texte est réservé aux questions audio',path:['allowTextSupplement']});
 if(q.textStyle&&q.type!=='statement')ctx.addIssue({code:'custom',message:'Le style de texte est réservé aux paragraphes',path:['textStyle']});
 if(q.richHtml&&q.type!=='statement')ctx.addIssue({code:'custom',message:'Le HTML enrichi est réservé aux paragraphes',path:['richHtml']});
 if(q.type==='statement'&&(q.logic?.branch||q.logic?.requiredWhen))ctx.addIssue({code:'custom',message:'Une redirection ou obligation nécessite une question répondable',path:['logic']});
 if(choice&&new Set(q.choices?.map(x=>(typeof x==='string'?x:x.label).toLocaleLowerCase('fr'))).size!==q.choices?.length)
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
 const result=input.pages.map(page=>{
  const questions:StudioQuestion[]=page.questions.map(item=>{
   const q=makeQuestion(item.type as QuestionType);
   q.label=item.label;
   q.description=item.description??null;
   q.required=item.type==='statement'?false:(item.required??false);
   const settings:Record<string,unknown>={};
   if(item.answerMode)settings.answerMode=item.answerMode;
   if(item.maxAudioSeconds)settings.maxAudioSeconds=item.maxAudioSeconds;
   if(item.allowTextSupplement!==undefined)settings.allowTextSupplement=item.allowTextSupplement;
   if(item.textStyle)settings.textStyle=item.textStyle;
   if(item.richHtml)settings.richHtml=item.richHtml;
   settings.logicId=logicKey(q);
   q.settings=settings;
   if(item.choices){
    // An explicitly listed Autre and allowOther=true must not produce duplicate choices.
    const otherIndex=item.allowOther?item.choices.findIndex(choice=>(typeof choice==='string'?choice:choice.label).trim().toLocaleLowerCase('fr')==='autre'):-1;
    q.options=item.choices.map((choice,index)=>({id:crypto.randomUUID(),value:index===otherIndex?OTHER_VALUE:'option_'+(index+1),
      label:typeof choice==='string'?choice:choice.label}));
    const cardEntries=item.choices.flatMap((choice,index)=>typeof choice==='string'?[]:[
      ['option_'+(index+1),{
       ...(choice.imageUrl?{imageSrc:choice.imageUrl}:{}),
       ...(choice.price?{price:choice.price}:{}),
       ...(choice.priceNote?{priceNote:choice.priceNote}:{}),
       ...(choice.date?{date:choice.date}:{}),
       ...(choice.venue?{venue:choice.venue}:{}),
       ...(choice.summary?{summary:choice.summary}:{}),
       ...(choice.url?{url:choice.url}:{}),
      }] as const,
    ]);
    if(cardEntries.length)q.settings.choiceCards=Object.fromEntries(cardEntries);
    if(item.allowOther&&otherIndex===-1)q.options.push({id:crypto.randomUUID(),value:OTHER_VALUE,label:'Autre'});
   } else q.options=[];
   return q;
  });
  return {id:crypto.randomUUID(),title:page.title??'Nouvelle page',description:page.description??null,questions};
 });
 // Resolve source references after generating every stable question key.
 function convert(group:z.infer<typeof mcpGroupSchema>):LogicGroup{
  return {match:group.match,conditions:group.conditions.map(condition=>{
   const source=result[condition.sourcePage]?.questions[condition.sourceQuestion];
   if(!source)throw new Error('Référence de question conditionnelle introuvable');
   let value=condition.value;
   if(value!==undefined&&['single_choice','multiple_choice','select'].includes(source.type)){
    const option=source.options.find(o=>o.value===value||o.label===value);
    if(!option)throw new Error('Choix conditionnel introuvable : '+value);
    value=option.value;
   }
   const out:LogicCondition={sourceKey:logicKey(source),operator:condition.operator};
   if(value!==undefined)out.value=value;
   return out;
  })};
 }
 input.pages.forEach((page,pageIndex)=>page.questions.forEach((item,index)=>{
  if(!item.logic)return;
  const target=result[pageIndex].questions[index];
  const logic:Record<string,unknown>={};
  if(item.logic.visibility)logic.visibility={...convert(item.logic.visibility),action:item.logic.visibility.action};
  if(item.logic.requiredWhen)logic.requiredWhen=convert(item.logic.requiredWhen);
  if(item.logic.branch){
   const targetPage=item.logic.branch.targetPage;
   const first=targetPage==='end'?undefined:result[targetPage]?.questions[0];
   if(targetPage!=='end'&&!first)throw new Error('Page de destination inconnue ou vide');
   logic.branch={...convert(item.logic.branch),target:targetPage==='end'?'END':logicKey(first!)};
  }
  target.settings={...target.settings,logic};
 }));
 return result;
}

export function compiledDraft(input:McpFormContent,versionId:string,expectedRevision:number):DraftPayload{
 const compiled={versionId,expectedRevision,pages:compileMcpPages(input)};
 return draftPayloadSchema.parse(compiled);
}
