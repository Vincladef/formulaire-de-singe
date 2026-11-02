import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { FormActions, NotFoundFault, ValidationFault } from './formActions';
import { ConflictFault, PermissionFault } from './studioRepository';
import { NeonResultsService, type ResultsService } from './resultsRepository';
import { NeonAudioService, type AudioService } from './audioService';
import { draftPayloadSchema, questionSchema, questionTypes, type StudioPageData, type StudioQuestion } from '../shared/studio';
import { formThemeSchema } from '../shared/theme';
import { resultsFilterSchema } from '../shared/results';

export const uuid = z.string().uuid();
export const titleSchema = z.string().trim().min(1).max(200);
export const formIdField = {formId:uuid.describe('UUID du formulaire obtenu via list_forms ou create_form')};
const labels=z.array(z.string().trim().min(1).max(180)).min(2).max(100);
export const newQuestion = z.object({type:z.enum(questionTypes),label:z.string().trim().min(1).max(600),description:z.string().max(3000).nullable().optional(),required:z.boolean().optional(),options:labels.optional(),settings:z.record(z.string(),z.unknown()).optional()}).strict();
export const questionPatch=z.object({label:z.string().trim().min(1).max(600).optional(),description:z.string().max(3000).nullable().optional(),required:z.boolean().optional(),options:labels.optional(),settings:z.record(z.string(),z.unknown()).optional()}).strict().refine(v=>Object.values(v).some(x=>x!==undefined),'Modification manquante');
export const filterSchema=z.object({from:z.string().optional(),to:z.string().optional(),versionId:uuid.optional(),limit:z.number().int().min(1).max(50).default(20),offset:z.number().int().min(0).max(10000).default(0)}).strict();
export const formPatch=z.object({title:titleSchema.optional(),theme:formThemeSchema.optional()}).strict().refine(v=>v.title!==undefined||v.theme!==undefined,'Titre ou thème requis');

export class McpApplication {
  constructor(private forms:FormActions=new FormActions(),private results:ResultsService=new NeonResultsService(),private audio:AudioService=new NeonAudioService()){}
  listForms(user:string,limit=20){return this.forms.list(user,limit);}
  getForm(user:string,id:string){return this.forms.get(user,id);}
  createForm(user:string,title:string){return this.forms.create(user,{title});}
  async updateForm(user:string,id:string,body:z.input<typeof formPatch>){
    const patch=formPatch.parse(body);const detail=await this.forms.get(user,id);
    if(detail.role==='viewer'||detail.archivedAt)throw new PermissionFault('Modification interdite');
    if(patch.title!==undefined)await this.forms.rename(user,id,{title:patch.title});
    if(patch.theme!==undefined)await this.forms.theme(user,id,patch.theme);
    return this.forms.get(user,id);
  }
  private async getDraft(user:string,id:string,revision?:number){
    const form=await this.forms.get(user,id);
    if(form.role==='viewer'||form.archivedAt)throw new PermissionFault('Modification interdite');
    const draft=form.versions.find(v=>v.status==='draft');
    if(!draft)throw new ConflictFault('Aucun brouillon modifiable');
    if(revision!==undefined&&revision!==draft.revision)throw new ConflictFault('Révision dépassée, relisez le brouillon');
    const pages:StudioPageData[]=draft.pages.map(p=>({id:p.id,title:p.title,description:p.description,questions:p.questions.map(q=>({id:q.id,type:q.type as StudioQuestion['type'],label:q.label,description:q.description,required:q.required,settings:q.settings,options:q.options.map(o=>({id:o.id,value:o.value,label:o.label}))}))}));
    return {draft,pages};
  }
  async addQuestions(user:string,formId:string,input:{pageId?:string;expectedRevision?:number;questions:z.input<typeof newQuestion>[]}){
    if(!input.questions.length||input.questions.length>25)throw new ValidationFault('1 à 25 questions par appel');
    const {draft,pages}=await this.getDraft(user,formId,input.expectedRevision);
    if(pages.length===0) pages.push({id:randomUUID(),title:'Première page',description:null,questions:[]});
    const page=input.pageId?pages.find(p=>p.id===input.pageId):pages[0];
    if(!page)throw new NotFoundFault('Page introuvable');
    const added:StudioQuestion[]=[];
    for(const raw of input.questions){
      const q=newQuestion.parse(raw);const choose=['single_choice','multiple_choice','select'].includes(q.type);
      const options=choose?(q.options??['Option 1','Option 2']).map((label,i)=>({id:randomUUID(),value:`option_${i+1}`,label})):[];
      const candidate=questionSchema.parse({id:randomUUID(),type:q.type,label:q.label,description:q.description??null,required:q.type==='statement'?false:(q.required??false),settings:q.settings??{},options});
      page.questions.push(candidate);added.push(candidate);
    }
    const payload={versionId:draft.id,expectedRevision:draft.revision??0,pages};draftPayloadSchema.parse(payload);
    const saved=await this.forms.save(user,formId,payload);
    return {formId,versionId:draft.id,revision:saved.revision,questions:added.map(q=>({id:q.id,label:q.label,type:q.type}))};
  }
  async updateQuestion(user:string,formId:string,input:{questionId:string;expectedRevision?:number;patch:z.input<typeof questionPatch>}){
    const patch=questionPatch.parse(input.patch);const {draft,pages}=await this.getDraft(user,formId,input.expectedRevision);
    const target=pages.flatMap(p=>p.questions).find(q=>q.id===input.questionId);
    if(!target)throw new NotFoundFault('Question introuvable dans le brouillon');
    if(patch.options&&!['single_choice','multiple_choice','select'].includes(target.type))throw new ValidationFault('Options non autorisées pour ce type');
    const changed=questionSchema.parse({...target,label:patch.label??target.label,description:patch.description===undefined?target.description:patch.description,required:patch.required??target.required,settings:patch.settings?{...target.settings,...patch.settings}:target.settings,options:patch.options?patch.options.map((label,i)=>({id:randomUUID(),value:`option_${i+1}`,label})):target.options});
    Object.assign(target,changed);
    const saved=await this.forms.save(user,formId,{versionId:draft.id,expectedRevision:draft.revision??0,pages});
    return {formId,versionId:draft.id,revision:saved.revision,question:changed};
  }
  async publishForm(user:string,formId:string,input:{expectedRevision?:number;confirmPublication:boolean}){
    if(input.confirmPublication!==true)throw new ValidationFault('Confirmation explicite obligatoire');
    const {draft}=await this.getDraft(user,formId,input.expectedRevision);
    const published=await this.forms.publish(user,formId,{versionId:draft.id,expectedRevision:draft.revision??0});
    const form=await this.forms.get(user,formId);
    const origin=process.env.PUBLIC_SITE_ORIGIN??'https://formulaire-de-singe.netlify.app';
    if(!/^https:\/\/[a-z0-9.-]+$/i.test(origin))throw new Error('Invalid site origin');
    return {...published,formId,publishedUrl:`${origin}/f/${encodeURIComponent(form.slug)}`};
  }
  private filters(input:unknown){return resultsFilterSchema.parse(input);}
  listSubmissions(user:string,formId:string,input:unknown){return this.results.overview(user,formId,this.filters(input));}
  getSubmission(user:string,formId:string,submissionId:string){return this.results.submission(user,formId,submissionId);}
  getAudio(user:string,audioId:string){return this.audio.access(user,audioId);}
  async exportResults(user:string,formId:string,input:unknown,format:'csv'|'json'){
    const file=await this.results.export(user,formId,this.filters(input),format);
    if(typeof file.content!=='string'||Buffer.byteLength(file.content,'utf8')>100000)throw new ValidationFault('Export trop volumineux pour ChatGPT. Réduisez la période ou utilisez le Studio.');
    return {filename:file.filename,contentType:file.contentType,content:file.content};
  }
}
