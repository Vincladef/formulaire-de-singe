import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { getDb } from './db/client';
import { forms, formVersions, pages, questions, questionOptions } from './db/schema';
import { getQuestionType, publicSubmitSchema, type PublicForm, type PublicSubmissionInput, validateAnswers } from '../shared/publicForm';
import { audioMode,audioLimits } from '../shared/audio';
import { evaluateLogic } from '../shared/conditionalLogic';

export class PublicFormFault extends Error {
  constructor(public status:number,public code:'NOT_FOUND'|'VALIDATION_ERROR'|'CONFLICT',message:string){super(message);}
}
export interface PublicFormService {
  get(slug:string):Promise<PublicForm|null>;
  submit(slug:string,input:PublicSubmissionInput):Promise<{id:string;alreadySubmitted:boolean}>;
}
export class NeonPublicFormService implements PublicFormService {
  async get(slug:string):Promise<PublicForm|null>{
    const db=getDb();
    const [row]=await db.select({id:forms.id,slug:forms.slug,title:forms.title,description:forms.description,settings:forms.settings,
      versionId:formVersions.id,number:formVersions.number}).from(forms)
      .innerJoin(formVersions,and(eq(formVersions.formId,forms.id),eq(formVersions.status,'published')))
      .where(and(eq(forms.slug,slug),isNull(forms.archivedAt),isNull(forms.deletedAt)))
      .orderBy(desc(formVersions.number)).limit(1);
    if(!row)return null;
    const resultPages=await hydratePages(row.versionId);
    return {id:row.id,slug:row.slug,title:row.title,description:row.description,versionId:row.versionId,versionNumber:row.number,
      requireConsent:false,pages:resultPages};
  }

  async submit(slug:string,input:PublicSubmissionInput):Promise<{id:string;alreadySubmitted:boolean}>{
    const parsed=publicSubmitSchema.parse(input);
    if(parsed.website)throw new PublicFormFault(400,'VALIDATION_ERROR','Envoi non accepté.');
    const form=await this.get(slug);
    if(!form)throw new PublicFormFault(404,'NOT_FOUND','Ce formulaire n’est pas disponible.');
    if(parsed.versionId!==form.versionId){
      // A participant may have opened an older published version before a new release.
      // The SQL function accepts the EXACT version displayed, after checking it belongs to this form.
      const old=await getPublicVersion(slug,parsed.versionId);
      if(!old)throw new PublicFormFault(409,'CONFLICT','Cette version du questionnaire n’est plus disponible.');
      return submitValidated(slug,old,parsed);
    }
    return submitValidated(slug,form,parsed);
  }
}

/** Three parallel reads instead of one network round-trip per question and per option list. */
async function hydratePages(versionId:string):Promise<PublicForm['pages']>{
 const db=getDb();
 const [pageRows,questionRows,optionRows]=await Promise.all([
  db.select({id:pages.id,title:pages.title,description:pages.description})
   .from(pages).where(eq(pages.versionId,versionId)).orderBy(asc(pages.position)),
  db.select({id:questions.id,pageId:questions.pageId,type:questions.type,label:questions.label,
   description:questions.description,required:questions.required,settings:questions.settings})
   .from(questions).innerJoin(pages,eq(questions.pageId,pages.id))
   .where(eq(pages.versionId,versionId)).orderBy(asc(pages.position),asc(questions.position)),
  db.select({questionId:questionOptions.questionId,value:questionOptions.value,label:questionOptions.label})
   .from(questionOptions).innerJoin(questions,eq(questionOptions.questionId,questions.id))
   .innerJoin(pages,eq(questions.pageId,pages.id))
   .where(eq(pages.versionId,versionId)).orderBy(asc(questionOptions.position)),
 ]);
 const optionsByQuestion=new Map<string,Array<{value:string;label:string}>>();
 for(const option of optionRows){
  if(!optionsByQuestion.has(option.questionId))optionsByQuestion.set(option.questionId,[]);
  optionsByQuestion.get(option.questionId)!.push({value:option.value,label:option.label});
 }
 const questionsByPage=new Map<string,PublicForm['pages'][number]['questions']>();
 for(const q of questionRows){
  if(!questionsByPage.has(q.pageId))questionsByPage.set(q.pageId,[]);
  const limits=audioLimits(q.settings);
  questionsByPage.get(q.pageId)!.push({
   id:q.id,type:getQuestionType(q.type),label:q.label,description:q.description,required:q.required,
   settings:q.type==='statement'?q.settings:{
    ...(typeof q.settings?.logicId==='string'?{logicId:q.settings.logicId}:{}),
    ...(q.settings?.logic&&typeof q.settings.logic==='object'?{logic:q.settings.logic}:{}),
    ...(q.type==='audio'?{allowTextSupplement:q.settings?.allowTextSupplement===true}:{}),
   },
   options:optionsByQuestion.get(q.id)??[],mode:audioMode(q.type,q.settings),
   maxAudioSeconds:limits.maxSeconds,maxAudioBytes:limits.maxBytes,
  });
 }
 return pageRows.map(page=>({...page,questions:questionsByPage.get(page.id)??[]}));
}
async function getPublicVersion(slug:string,versionId:string):Promise<PublicForm|null>{
  const db=getDb();
  const [row]=await db.select({id:forms.id,slug:forms.slug,title:forms.title,description:forms.description,settings:forms.settings,
    versionId:formVersions.id,number:formVersions.number}).from(forms).innerJoin(formVersions,and(eq(formVersions.formId,forms.id),eq(formVersions.id,versionId),eq(formVersions.status,'published')))
    .where(and(eq(forms.slug,slug),isNull(forms.archivedAt),isNull(forms.deletedAt))).limit(1);
  if(!row)return null;
  const resultPages=await hydratePages(row.versionId);
  return {id:row.id,slug,title:row.title,description:row.description,versionId:row.versionId,versionNumber:row.number,requireConsent:false,pages:resultPages};
}
async function submitValidated(slug:string,form:PublicForm,input:PublicSubmissionInput){
  if(form.requireConsent&&!input.consent)throw new PublicFormFault(400,'VALIDATION_ERROR','Le consentement est nécessaire pour participer.');
  const knownIds=new Set(form.pages.flatMap(p=>p.questions.filter(q=>q.type!=='statement').map(q=>q.id)));
  if(new Set(input.answers.map(a=>a.questionId)).size!==input.answers.length || input.answers.some(a=>!knownIds.has(a.questionId)))
    throw new PublicFormFault(400,'VALIDATION_ERROR','Réponse inconnue ou en double.');
  const values=Object.fromEntries(input.answers.map(a=>[a.questionId,a.value]));
  const active=evaluateLogic(form.pages,values);
  if(input.answers.some(answer=>!active.visibleIds.has(answer.questionId)))
    throw new PublicFormFault(400,'VALIDATION_ERROR','Une réponse concerne une question non affichée dans ce parcours.');
  const issues=validateAnswers(form,values);
  if(Object.keys(issues).length)throw new PublicFormFault(400,'VALIDATION_ERROR',Object.values(issues)[0]);
  // Hash protects an idempotency key against reuse with a different payload.
  const canonical=[...input.answers].sort((a,b)=>a.questionId.localeCompare(b.questionId)).map(a=>[a.questionId,
    Array.isArray(a.value)?[...a.value].sort():a.value]);
  const digest=createHash('sha256').update(JSON.stringify({versionId:input.versionId,consent:input.consent,answers:canonical})).digest('hex');
  const db=getDb();
  try{
    const result=await db.execute(sql`SELECT * FROM fs_submit_public(${slug},${input.versionId}::uuid,${input.clientNonce}::uuid,${digest},${input.consent},${JSON.stringify(input.answers)}::jsonb)`);
    const row=result.rows[0];
    if(!row)throw new Error('Aucune confirmation de soumission');
    return {id:String(row.submission_id),alreadySubmitted:Boolean(row.already_submitted)};
  }catch(error){
    const message=error instanceof Error?error.message:'';
    if(/NONCE_CONFLICT/i.test(message))throw new PublicFormFault(409,'CONFLICT','Cette participation a déjà été envoyée avec d’autres réponses.');
    if(/FORM_UNAVAILABLE|VERSION_UNAVAILABLE/i.test(message))throw new PublicFormFault(404,'NOT_FOUND','Ce formulaire n’est plus accessible.');
    if(/CONSENT_REQUIRED|INVALID_ANSWER|MISSING_REQUIRED|AUDIO_UNAVAILABLE/i.test(message))throw new PublicFormFault(400,'VALIDATION_ERROR','Les réponses ne sont pas valides.');
    throw error;
  }
}
