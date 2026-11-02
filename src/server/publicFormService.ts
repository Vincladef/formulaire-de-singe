import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { getDb } from './db/client';
import { forms, formVersions, pages, questions, questionOptions } from './db/schema';
import { getQuestionType, publicSubmitSchema, type PublicForm, type PublicSubmissionInput, validateAnswers } from '../shared/publicForm';
import { audioMode,audioLimits } from '../shared/audio';

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
    const pageRows=await db.select({id:pages.id,title:pages.title,description:pages.description})
      .from(pages).where(eq(pages.versionId,row.versionId)).orderBy(asc(pages.position));
    const resultPages=[];
    let hasAudio=false;
    for(const p of pageRows){
      const qs=await db.select({id:questions.id,type:questions.type,label:questions.label,description:questions.description,required:questions.required,settings:questions.settings})
        .from(questions).where(eq(questions.pageId,p.id)).orderBy(asc(questions.position));
      const resultQuestions=[];
      for(const q of qs){
        const options=await db.select({value:questionOptions.value,label:questionOptions.label}).from(questionOptions)
          .where(eq(questionOptions.questionId,q.id)).orderBy(asc(questionOptions.position));
        hasAudio ||=audioMode(q.type,q.settings)!=='text';
        const limits=audioLimits(q.settings);
        resultQuestions.push({id:q.id,type:getQuestionType(q.type),label:q.label,description:q.description,required:q.required,options,mode:audioMode(q.type,q.settings),maxAudioSeconds:limits.maxSeconds,maxAudioBytes:limits.maxBytes});
      }
      resultPages.push({...p,questions:resultQuestions});
    }
    return {id:row.id,slug:row.slug,title:row.title,description:row.description,versionId:row.versionId,versionNumber:row.number,
      requireConsent:row.settings?.requireConsent===true||hasAudio,pages:resultPages};
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

async function getPublicVersion(slug:string,versionId:string):Promise<PublicForm|null>{
  const db=getDb();
  const [row]=await db.select({id:forms.id,slug:forms.slug,title:forms.title,description:forms.description,settings:forms.settings,
    versionId:formVersions.id,number:formVersions.number}).from(forms).innerJoin(formVersions,and(eq(formVersions.formId,forms.id),eq(formVersions.id,versionId),eq(formVersions.status,'published')))
    .where(and(eq(forms.slug,slug),isNull(forms.archivedAt),isNull(forms.deletedAt))).limit(1);
  if(!row)return null;
  const pageRows=await db.select().from(pages).where(eq(pages.versionId,row.versionId)).orderBy(asc(pages.position));
  const resultPages:PublicForm['pages']=[];let hasAudio=false;
  for(const p of pageRows){
    const qs=await db.select().from(questions).where(eq(questions.pageId,p.id)).orderBy(asc(questions.position));
    const resultQuestions:PublicForm['pages'][number]['questions']=[];
    for(const q of qs){
      const opts=await db.select({value:questionOptions.value,label:questionOptions.label}).from(questionOptions)
        .where(eq(questionOptions.questionId,q.id)).orderBy(asc(questionOptions.position));
      hasAudio ||=audioMode(q.type,q.settings)!=='text';
      const limits=audioLimits(q.settings);
      resultQuestions.push({id:q.id,type:getQuestionType(q.type),label:q.label,description:q.description,required:q.required,options:opts,mode:audioMode(q.type,q.settings),maxAudioSeconds:limits.maxSeconds,maxAudioBytes:limits.maxBytes});
    }
    resultPages.push({id:p.id,title:p.title,description:p.description,questions:resultQuestions});
  }
  return {id:row.id,slug,title:row.title,description:row.description,versionId:row.versionId,versionNumber:row.number,requireConsent:row.settings?.requireConsent===true||hasAudio,pages:resultPages};
}
async function submitValidated(slug:string,form:PublicForm,input:PublicSubmissionInput){
  if(form.requireConsent&&!input.consent)throw new PublicFormFault(400,'VALIDATION_ERROR','Le consentement est nécessaire pour participer.');
  const knownIds=new Set(form.pages.flatMap(p=>p.questions.filter(q=>q.type!=='statement').map(q=>q.id)));
  if(new Set(input.answers.map(a=>a.questionId)).size!==input.answers.length || input.answers.some(a=>!knownIds.has(a.questionId)))
    throw new PublicFormFault(400,'VALIDATION_ERROR','Réponse inconnue ou en double.');
  const values=Object.fromEntries(input.answers.map(a=>[a.questionId,a.value]));
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
