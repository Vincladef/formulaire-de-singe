import { z } from 'zod';
import { FormActions, NotFoundFault, ValidationFault } from './formActions';
import { ConflictFault, PermissionFault } from './studioRepository';
import { compileMcpPages, mcpQuestionSchema } from '../shared/mcpForm';
import { evaluateLogic, logicKey, type LogicCondition, type LogicOperator } from '../shared/conditionalLogic';
import type { StudioPageData, StudioQuestion } from '../shared/studio';
import type { FormDetail } from '../shared/formApi';
import { getFormResults } from './resultsService';
import { getTranscriptionSummary, requestFormTranscription, wakeTranscriptionWorker } from './transcriptionService';
import { getSheetsStatus, syncGoogleSheets } from './sheetsService';

export const formIdSchema=z.string().uuid();
const https=z.string().url().max(2048).refine(v=>v.startsWith('https://'),{message:'URL HTTPS nécessaire'});
export const cardFields=z.object({
 imageUrl:https.nullable().optional(),
 price:z.string().max(80).nullable().optional(),
 priceNote:z.string().max(200).nullable().optional(),
 date:z.string().max(120).nullable().optional(),
 venue:z.string().max(160).nullable().optional(),
 summary:z.string().max(600).nullable().optional(),
 url:https.nullable().optional(),
}).strict();
export const patchQuestionSchema=z.object({
 label:z.string().trim().min(1).max(50000).optional(),
 description:z.string().max(3000).nullable().optional(),
 required:z.boolean().optional(),
 choices:z.array(z.string().trim().min(1).max(180)).min(2).max(100).optional(),
 answerMode:z.enum(['text','audio','either']).optional(),
 maxAudioSeconds:z.number().int().min(15).max(1800).optional(),
 allowTextSupplement:z.boolean().optional(),
 textStyle:z.enum(['paragraph','heading','quote']).optional(),
 richHtml:z.string().max(250000).nullable().optional(),
}).strict();
export const sourceCondition=z.object({
 sourceQuestionId:formIdSchema,
 operator:z.enum(['equals','not_equals','contains','not_contains','is_empty','not_empty','greater_than','less_than']),
 value:z.string().max(300).optional().describe('Libellé de choix (ou valeur) ou texte/nombre comparé'),
}).strict();
export const logicGroup=z.object({
 match:z.enum(['all','any']).default('all'),
 conditions:z.array(sourceCondition).min(1).max(20),
}).strict();
export const logicEdit=z.object({
 visibility:logicGroup.extend({action:z.enum(['show','hide'])}).nullable().optional(),
 requiredWhen:logicGroup.nullable().optional(),
 branch:logicGroup.extend({targetPageId:z.union([formIdSchema,z.literal('END')])}).nullable().optional(),
}).strict();

function settingsCompact(raw:Record<string,unknown>,media:boolean){
 if(media)return raw;
 const out:Record<string,unknown>={...raw};
 if(typeof out.richHtml==='string'){
  const html=out.richHtml as string;
  // Never send multi-megabyte data URLs to ChatGPT for a text-only read.
  out.richHtml=html.replace(/data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+/g,'[image intégrée masquée]').slice(0,3000);
  out.richHtmlOriginalLength=html.length;
 }
 if(out.choiceCards&&typeof out.choiceCards==='object'&&!Array.isArray(out.choiceCards)){
  out.choiceCards=Object.fromEntries(Object.entries(out.choiceCards).map(([key,data])=>{
   if(!data||typeof data!=='object'||Array.isArray(data))return [key,data];
   const card={...(data as Record<string,unknown>)};
   if(typeof card.imageSrc==='string'&&card.imageSrc.startsWith('data:image/')){
    card.imageBytes=card.imageSrc.length;
    card.imageSrc='[image intégrée masquée]';
   }
   return [key,card];
  }));
 }
 return out;
}
export function compactForm(detail:FormDetail,opts:{version?:'draft'|'published'|'all';includeMedia?:boolean}={}){
 const version=opts.version??'draft';
 let versions=detail.versions;
 if(version==='draft')versions=detail.versions.filter(v=>v.status==='draft');
 if(version==='published')versions=detail.versions.filter(v=>v.status==='published').slice(0,1);
 if(version!=='all'&&!versions.length)versions=detail.versions.slice(0,1);
 return {...detail,versions:versions.map(v=>({
  ...v,pages:v.pages.map(p=>({...p,questions:p.questions.map(q=>({
   ...q,settings:settingsCompact(q.settings,opts.includeMedia===true),
  }))})),
 }))};
}
export function formSummary(detail:FormDetail){
 return {
  id:detail.id,title:detail.title,slug:detail.slug,role:detail.role,folderId:detail.folderId,
  publicUrl:detail.versions.some(v=>v.status==='published')?'https://monk-form.netlify.app/f/'+encodeURIComponent(detail.slug):null,
  studioUrl:'https://monk-form.netlify.app/studio',
  versions:detail.versions.map(v=>({
   id:v.id,number:v.number,status:v.status,revision:v.revision,publishedAt:v.publishedAt,
   pages:v.pages.length,questions:v.pages.reduce((n,p)=>n+p.questions.filter(q=>q.type!=='statement').length,0),
  })),
 };
}
function asPages(detail:FormDetail){
 const draft=detail.versions.find(v=>v.status==='draft');
 if(!draft)throw new ConflictFault('Aucun brouillon disponible pour ce formulaire');
 const pages:StudioPageData[]=draft.pages.map(p=>({
  id:p.id,title:p.title,description:p.description,
  questions:p.questions.map(q=>({
   id:q.id,type:q.type as StudioQuestion['type'],label:q.label,description:q.description,required:q.required,
   settings:structuredClone(q.settings),options:q.options.map(o=>({id:o.id,value:o.value,label:o.label})),
  })),
 }));
 return {draft,pages};
}
function findQuestion(pages:StudioPageData[],id:string):StudioQuestion{
 const q=pages.flatMap(p=>p.questions).find(q=>q.id===id);
 if(!q)throw new NotFoundFault('Question introuvable dans le brouillon');
 return q;
}
function optionByLabel(q:StudioQuestion,label:string){
 const o=q.options.find(o=>o.value===label||o.label===label);
 if(!o)throw new ValidationFault('Option introuvable : '+label);
 return o;
}
function applyQuestionPatch(q:StudioQuestion,patch:z.infer<typeof patchQuestionSchema>){
 if(patch.label!==undefined){if(q.type!=='statement'&&patch.label.length>600)throw new ValidationFault('Question trop longue');q.label=patch.label;}
 if(patch.description!==undefined)q.description=patch.description;
 if(patch.required!==undefined){if(q.type==='statement'&&patch.required)throw new ValidationFault('Un texte explicatif ne peut pas être obligatoire');q.required=patch.required;}
 if(patch.choices!==undefined){
  if(!['single_choice','multiple_choice','select'].includes(q.type))throw new ValidationFault('Ce type de question ne possède pas de choix');
  if(new Set(patch.choices.map(x=>x.toLocaleLowerCase('fr'))).size!==patch.choices.length)throw new ValidationFault('Options répétées');
  const old=q.options;
  const used=new Set<string>();
  q.options=patch.choices.map((label,i)=>{
   // Keep the original value/ID for moved choices so conditional rules and
   // image cards still refer to the same semantic option after reordering.
   const byLabel=old.find(o=>o.label===label&&!used.has(o.id));
   const byIndex=old[i]&&!used.has(old[i].id)?old[i]:undefined;
   const original=byLabel??byIndex??old.find(o=>!used.has(o.id));
   if(original){used.add(original.id);return {...original,label};}
   return {id:crypto.randomUUID(),value:'option_'+crypto.randomUUID().slice(0,8),label};
  });
  const cards=q.settings.choiceCards;
  if(cards&&typeof cards==='object'&&!Array.isArray(cards)){
   q.settings.choiceCards=Object.fromEntries(Object.entries(cards).filter(([key])=>q.options.some(o=>o.value===key)));
  }
 }
 if(patch.answerMode!==undefined){
  if(!['audio','short_text','long_text'].includes(q.type))throw new ValidationFault('Mode audio incompatible avec cette question');
  q.settings.answerMode=patch.answerMode;
 }
 if(patch.maxAudioSeconds!==undefined){
  if(!['audio','short_text','long_text'].includes(q.type))throw new ValidationFault('Durée audio incompatible');
  q.settings.maxAudioSeconds=patch.maxAudioSeconds;
 }
 if(patch.allowTextSupplement!==undefined){
  if(q.type!=='audio')throw new ValidationFault('Le complément texte concerne une réponse audio');
  q.settings.allowTextSupplement=patch.allowTextSupplement;
 }
 if(patch.textStyle!==undefined){
  if(q.type!=='statement')throw new ValidationFault('Le style de texte concerne un paragraphe');
  q.settings.textStyle=patch.textStyle;
 }
 if(patch.richHtml!==undefined){
  if(q.type!=='statement')throw new ValidationFault('Seuls les paragraphes acceptent du HTML enrichi');
  if(patch.richHtml===null)delete q.settings.richHtml;
  else q.settings.richHtml=patch.richHtml;
 }
}

export class McpWorkflowExtras{
 constructor(private readonly forms:Pick<FormActions,'get'|'save'|'duplicate'|'state'>=new FormActions(),
 private readonly external={
  getResults:getFormResults,
  sheetStatus:getSheetsStatus,
  syncSheets:syncGoogleSheets,
  transcriptionStatus:getTranscriptionSummary,
  transcribe:requestFormTranscription,
  wake:wakeTranscriptionWorker,
 }){}
 private async editable(userId:string,formId:string,expectedRevision:number){
  const detail=await this.forms.get(userId,formId);
  if(detail.role==='viewer')throw new PermissionFault('Lecture seule : modification impossible');
  const {draft,pages}=asPages(detail);
  if((draft.revision??0)!==expectedRevision)throw new ConflictFault('Brouillon modifié ; récupère la nouvelle révision avant de continuer');
  return {draft,pages};
 }
 private async save(userId:string,formId:string,expectedRevision:number,pages:StudioPageData[]){
  const {draft}=await this.editable(userId,formId,expectedRevision);
  const done=await this.forms.save(userId,formId,{versionId:draft.id,expectedRevision,pages});
  return {formId,versionId:draft.id,revision:done.revision,updated:true,published:false};
 }
 async get(userId:string,formId:string,opts?:{version?:'draft'|'published'|'all';includeMedia?:boolean}){
  return compactForm(await this.forms.get(userId,formId),opts);
 }
 async summary(userId:string,formId:string){return formSummary(await this.forms.get(userId,formId));}
 async updateQuestion(userId:string,formId:string,expectedRevision:number,questionId:string,patch:z.infer<typeof patchQuestionSchema>){
  const {pages}=await this.editable(userId,formId,expectedRevision);
  const q=findQuestion(pages,questionId);
  applyQuestionPatch(q,patch);
  const result=await this.save(userId,formId,expectedRevision,pages);
  return {...result,questionId};
 }
 async updateQuestionsBulk(userId:string,formId:string,expectedRevision:number,
  updates:Array<{questionId:string}&z.infer<typeof patchQuestionSchema>>){
  const {pages}=await this.editable(userId,formId,expectedRevision);
  if(new Set(updates.map(u=>u.questionId)).size!==updates.length)throw new ValidationFault('Question en double dans la modification groupée');
  updates.forEach(({questionId})=>findQuestion(pages,questionId));
  for(const {questionId,...patch} of updates){
   if(!Object.keys(patch).length)throw new ValidationFault('Modification vide pour '+questionId);
   applyQuestionPatch(findQuestion(pages,questionId),patch);
  }
  return {...await this.save(userId,formId,expectedRevision,pages),changedQuestions:updates.map(u=>u.questionId)};
 }
 async movePage(userId:string,formId:string,expectedRevision:number,pageId:string,position:number){
  const {pages}=await this.editable(userId,formId,expectedRevision);
  const old=pages.findIndex(p=>p.id===pageId);
  if(old<0)throw new NotFoundFault('Page introuvable');
  const [page]=pages.splice(old,1);
  pages.splice(Math.min(position,pages.length),0,page);
  return {...await this.save(userId,formId,expectedRevision,pages),pageId,position:pages.findIndex(p=>p.id===pageId)};
 }
 async updateChoiceCard(userId:string,formId:string,expectedRevision:number,questionId:string,
  optionLabel:string,patch:z.infer<typeof cardFields>){
  const {pages}=await this.editable(userId,formId,expectedRevision);
  const q=findQuestion(pages,questionId);
  if(!['single_choice','multiple_choice','select'].includes(q.type))throw new ValidationFault('Les cartes concernent les questions à choix');
  const option=optionByLabel(q,optionLabel);
  const old=q.settings.choiceCards&&typeof q.settings.choiceCards==='object'&&!Array.isArray(q.settings.choiceCards)
   ?q.settings.choiceCards as Record<string,Record<string,unknown>>:{};
  const card={...old[option.value]};
  for(const [name,value] of Object.entries(patch)){
   const key=name==='imageUrl'?'imageSrc':name;
   if(value===null)delete card[key];
   else if(value!==undefined)card[key]=value;
  }
  q.settings.choiceCards={...old,[option.value]:card};
  const result=await this.save(userId,formId,expectedRevision,pages);
  return {...result,questionId,option:option.label,card:{...card,imageSrc:typeof card.imageSrc==='string'&&card.imageSrc.startsWith('data:image/')?'[image intégrée]':card.imageSrc}};
 }
 async updateChoiceCards(userId:string,formId:string,expectedRevision:number,questionId:string,
  patches:Array<{optionLabel:string}&z.infer<typeof cardFields>>){
  const {pages}=await this.editable(userId,formId,expectedRevision);
  const q=findQuestion(pages,questionId);
  if(!['single_choice','multiple_choice','select'].includes(q.type))throw new ValidationFault('Ce type de question ne possède pas de cartes');
  if(new Set(patches.map(p=>p.optionLabel)).size!==patches.length)throw new ValidationFault('Option répétée dans le lot');
  const initial=q.settings.choiceCards&&typeof q.settings.choiceCards==='object'&&!Array.isArray(q.settings.choiceCards)
   ?q.settings.choiceCards as Record<string,Record<string,unknown>>:{};
  const cards={...initial};
  for(const {optionLabel,...patch} of patches){
   const option=optionByLabel(q,optionLabel);
   const card={...cards[option.value]};
   for(const [name,value] of Object.entries(patch)){
    const key=name==='imageUrl'?'imageSrc':name;
    if(value===null)delete card[key];
    else if(value!==undefined)card[key]=value;
   }
   cards[option.value]=card;
  }
  q.settings.choiceCards=cards;
  const result=await this.save(userId,formId,expectedRevision,pages);
  return {...result,questionId,updatedCards:patches.length};
 }
 async addQuestion(userId:string,formId:string,expectedRevision:number,pageId:string,
  question:z.infer<typeof mcpQuestionSchema>,position?:number){
  if(question.logic)throw new ValidationFault('Pour une nouvelle question, applique sa logique dans une deuxième opération');
  const {pages}=await this.editable(userId,formId,expectedRevision);
  const page=pages.find(p=>p.id===pageId);
  if(!page)throw new NotFoundFault('Page introuvable');
  const added=compileMcpPages({pages:[{questions:[question]}]})[0].questions[0];
  page.questions.splice(position===undefined?page.questions.length:Math.min(position,page.questions.length),0,added);
  const result=await this.save(userId,formId,expectedRevision,pages);
  return {...result,pageId,questionId:added.id,label:added.label};
 }
 async removeQuestion(userId:string,formId:string,expectedRevision:number,questionId:string,confirm:boolean){
  if(!confirm)throw new ValidationFault('Confirme explicitement la suppression de cette question');
  const {pages}=await this.editable(userId,formId,expectedRevision);
  const page=pages.find(p=>p.questions.some(q=>q.id===questionId));
  if(!page)throw new NotFoundFault('Question introuvable');
  page.questions=page.questions.filter(q=>q.id!==questionId);
  const result=await this.save(userId,formId,expectedRevision,pages);
  return {...result,questionId,removed:true};
 }
 async setLogic(userId:string,formId:string,expectedRevision:number,questionId:string,rule:z.infer<typeof logicEdit>){
  const {pages}=await this.editable(userId,formId,expectedRevision);
  const q=findQuestion(pages,questionId);
  if(q.type==='statement'&&(rule.branch||rule.requiredWhen))throw new ValidationFault('Une redirection ou obligation nécessite une question répondable');
  const all=pages.flatMap(p=>p.questions);
  function transform(group:z.infer<typeof logicGroup>){
   return {match:group.match,conditions:group.conditions.map(c=>{
    const source=all.find(q=>q.id===c.sourceQuestionId);
    if(!source)throw new NotFoundFault('Question de référence introuvable');
    const value=c.value===undefined?undefined:
     ['single_choice','multiple_choice','select'].includes(source.type) ? optionByLabel(source,c.value).value:c.value;
    const transformed:LogicCondition={sourceKey:logicKey(source),operator:c.operator as LogicOperator};
    if(value!==undefined)transformed.value=value;
    return transformed;
   })};
  }
  const settings=q.settings.logic&&typeof q.settings.logic==='object'&&!Array.isArray(q.settings.logic)?
   {...q.settings.logic as Record<string,unknown>}:{};
  if(rule.visibility!==undefined){
   if(rule.visibility===null)delete settings.visibility;
   else settings.visibility={...transform(rule.visibility),action:rule.visibility.action};
  }
  if(rule.requiredWhen!==undefined){
   if(rule.requiredWhen===null)delete settings.requiredWhen;
   else settings.requiredWhen=transform(rule.requiredWhen);
  }
  if(rule.branch!==undefined){
   if(rule.branch===null)delete settings.branch;
   else{
    const target=rule.branch.targetPageId==='END'?'END':
     logicKey(pages.find(p=>p.id===rule.branch?.targetPageId)?.questions[0]??(()=>{throw new NotFoundFault('Page cible introuvable ou vide');})());
    settings.branch={...transform(rule.branch),target};
   }
  }
  q.settings.logic=settings;
  const result=await this.save(userId,formId,expectedRevision,pages);
  return {...result,questionId,logic:settings};
 }
 async addPage(userId:string,formId:string,expectedRevision:number,title:string,description?:string|null){
  const {pages}=await this.editable(userId,formId,expectedRevision);
  if(pages.length>=40)throw new ValidationFault('Limite de 40 pages atteinte');
  const page={id:crypto.randomUUID(),title,description:description??null,questions:[]};
  pages.push(page);
  const result=await this.save(userId,formId,expectedRevision,pages);
  return {...result,pageId:page.id,title};
 }
 async updatePage(userId:string,formId:string,expectedRevision:number,pageId:string,
  patch:{title?:string;description?:string|null}){
  const {pages}=await this.editable(userId,formId,expectedRevision);
  const page=pages.find(p=>p.id===pageId);
  if(!page)throw new NotFoundFault('Page introuvable');
  if(patch.title!==undefined)page.title=patch.title;
  if(patch.description!==undefined)page.description=patch.description;
  return {...await this.save(userId,formId,expectedRevision,pages),pageId};
 }
 async deletePage(userId:string,formId:string,expectedRevision:number,pageId:string,confirm:boolean){
  if(!confirm)throw new ValidationFault('Confirme explicitement la suppression de cette page');
  const {pages}=await this.editable(userId,formId,expectedRevision);
  if(pages.length<2)throw new ValidationFault('Un formulaire doit conserver au moins une page');
  const index=pages.findIndex(p=>p.id===pageId);
  if(index<0)throw new NotFoundFault('Page introuvable');
  pages.splice(index,1);
  return {...await this.save(userId,formId,expectedRevision,pages),pageId,deleted:true};
 }
 async moveQuestion(userId:string,formId:string,expectedRevision:number,questionId:string,
  targetPageId:string,position:number){
  const {pages}=await this.editable(userId,formId,expectedRevision);
  const source=pages.find(p=>p.questions.some(q=>q.id===questionId));
  const target=pages.find(p=>p.id===targetPageId);
  if(!source||!target)throw new NotFoundFault('Page ou question introuvable');
  const questionIndex=source.questions.findIndex(q=>q.id===questionId);
  const [question]=source.questions.splice(questionIndex,1);
  if(target.questions.length>=150){source.questions.splice(questionIndex,0,question);
   throw new ValidationFault('La page cible est pleine (150 questions)');}
  target.questions.splice(Math.min(position,target.questions.length),0,question);
  return {...await this.save(userId,formId,expectedRevision,pages),questionId,pageId:targetPageId};
 }
 async deleteForm(userId:string,formId:string,confirm:boolean){
  if(!confirm)throw new ValidationFault('Confirme explicitement la suppression du formulaire');
  const detail=await this.forms.get(userId,formId);
  if(detail.role!=='owner')throw new PermissionFault('Seul le propriétaire peut supprimer ce formulaire');
  const result=await this.forms.state(userId,formId,{action:'delete'});
  if(!result)throw new NotFoundFault('Formulaire introuvable');
  return {formId,deleted:true,notice:'Suppression logique. Les versions publiées ne sont plus accessibles.'};
 }
 async preview(userId:string,formId:string,answers:Array<{questionId:string;value:string|string[]}>){
  const detail=await this.forms.get(userId,formId);
  const {pages}=asPages(detail);
  const formAnswers:Record<string,unknown>={};
  for(const answer of answers){
   const q=findQuestion(pages,answer.questionId);
   const convert=(value:string)=>['single_choice','multiple_choice','select'].includes(q.type)?optionByLabel(q,value).value:value;
   formAnswers[q.id]=Array.isArray(answer.value)?answer.value.map(convert):convert(answer.value);
  }
  const outcome=evaluateLogic(pages,formAnswers);
  return {formId,stepIndices:outcome.pageIndices,
   pages:outcome.pageIndices.map(i=>({
    id:pages[i].id,title:pages[i].title,
    questions:pages[i].questions.filter(q=>outcome.visibleIds.has(q.id)).map(q=>({
     id:q.id,label:q.label,type:q.type,required:outcome.requiredIds.has(q.id),
    })),
   })),simulatedOnly:true,submitted:false};
 }
 results(userId:string,formId:string,page:number,limit:number){return this.external.getResults(userId,formId,page,limit);}
 sheetsStatus(userId:string,formId:string){return this.external.sheetStatus(userId,formId);}
 async sheetsSync(userId:string,formId:string,confirm:boolean){
  if(!confirm)throw new ValidationFault('Confirme la synchronisation Google Sheets');
  const status=await this.external.sheetStatus(userId,formId);
  if(!status.connected)throw new ValidationFault('Google Sheets n’est pas connecté à ce formulaire');
  return this.external.syncSheets(20,formId);
 }
 transcriptionStatus(userId:string,formId:string){return this.external.transcriptionStatus(userId,formId);}
 async transcribeRemaining(userId:string,formId:string,confirm:boolean){
  if(!confirm)throw new ValidationFault('Confirme la mise en file de transcription');
  const done=await this.external.transcribe(userId,formId);
  if(done.newlyQueued>0)await this.external.wake().catch(()=>false);
  return done;
 }
 duplicate(userId:string,formId:string){return this.forms.duplicate(userId,formId);}
 async archive(userId:string,formId:string,action:'archive'|'unarchive',confirm:boolean){
  if(!confirm)throw new ValidationFault('Confirme le changement de statut du formulaire');
  return this.forms.state(userId,formId,{action});
 }
}
