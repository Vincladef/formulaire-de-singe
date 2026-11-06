import { z } from 'zod';

export const questionTypes = ['short_text','long_text','single_choice','multiple_choice','select','number','date','audio','statement'] as const;
export type QuestionType = typeof questionTypes[number];
/** An editor-only option; audio_text is stored as audio with allowTextSupplement=true. */
export type InsertQuestionType = QuestionType | 'audio_text';
export const insertQuestionTypes: InsertQuestionType[] = [...questionTypes.slice(0,-1),'audio_text','statement'];
export const questionTypeNames: Record<QuestionType,string> = {
  short_text:'Texte court', long_text:'Texte long',single_choice:'Choix unique',multiple_choice:'Choix multiples',
  select:'Liste déroulante',number:'Nombre',date:'Date',audio:'Réponse audio',statement:'Bloc explicatif',
};
export function insertionQuestionName(type:InsertQuestionType):string {
  return type==='audio_text'?'Audio + texte facultatif':type==='audio'?'Audio uniquement':questionTypeNames[type];
}
export function questionDisplayName(question:Pick<StudioQuestion,'type'|'settings'>):string {
  return question.type==='audio'&&question.settings.allowTextSupplement===true?'Audio + texte facultatif':insertionQuestionName(question.type);
}
export const optionSchema = z.object({id:z.string().uuid(),value:z.string().trim().min(1).max(100),label:z.string().trim().min(1).max(180)}).strict();
export const questionSchema = z.object({
  id:z.string().uuid(),type:z.enum(questionTypes),label:z.string().trim().min(1).max(50000),
  description:z.string().max(3000).nullable(), required:z.boolean(),settings:z.record(z.string(),z.unknown()),
  options:z.array(optionSchema).max(100),
}).strict().superRefine((q,ctx)=>{
  if (['single_choice','multiple_choice','select'].includes(q.type) && q.options.length < 2)
    ctx.addIssue({code:'custom',message:'Deux options au minimum',path:['options']});
  if (new Set(q.options.map(o=>o.value)).size !== q.options.length)
    ctx.addIssue({code:'custom',message:'Les valeurs des choix doivent être uniques',path:['options']});
  if (q.type !== 'statement' && q.label.length > 600)
    ctx.addIssue({code:'custom',message:'Une question ne peut pas dépasser 600 caractères',path:['label']});
  if (q.type === 'statement' && q.required)
    ctx.addIssue({code:'custom',message:'Un bloc explicatif ne peut pas être obligatoire',path:['required']});
});
export const pageSchema = z.object({id:z.string().uuid(),title:z.string().max(200),description:z.string().max(3000).nullable(),questions:z.array(questionSchema).max(150)}).strict();
export const draftPayloadSchema = z.object({versionId:z.string().uuid(),expectedRevision:z.number().int().min(0),pages:z.array(pageSchema).min(1).max(40)}).strict().superRefine((data,ctx)=>{
  const ids=new Set<string>();
  for(const page of data.pages){
    if(ids.has(page.id)) ctx.addIssue({code:'custom',message:'Identifiant de page répété'});ids.add(page.id);
    for(const question of page.questions){
      if(ids.has(question.id))ctx.addIssue({code:'custom',message:'Identifiant de question répété'});ids.add(question.id);
      for(const option of question.options){if(ids.has(option.id))ctx.addIssue({code:'custom',message:'Identifiant de choix répété'});ids.add(option.id);}
    }
  }
});
export const statusActionSchema=z.object({action:z.enum(['archive','unarchive','delete'])}).strict();
export const publishInputSchema=z.object({versionId:z.string().uuid(),expectedRevision:z.number().int().min(0)}).strict();
export type StudioPageData=z.infer<typeof pageSchema>;
export type StudioQuestion=z.infer<typeof questionSchema>;
export type DraftPayload=z.infer<typeof draftPayloadSchema>;

export function makeQuestion(type:InsertQuestionType): StudioQuestion {
  const storedType:QuestionType=type==='audio_text'?'audio':type;
  const choices=['single_choice','multiple_choice','select'].includes(storedType);
  return {id:crypto.randomUUID(),type:storedType,label:storedType==='statement'?'Un petit mot avant de continuer':'Votre question',description:null,
    required:false,settings:type==='audio_text'?{allowTextSupplement:true}:{},
    options:choices?['Option 1','Option 2'].map((label,i)=>({id:crypto.randomUUID(),label,value:`option_${i+1}`})):[]};
}
export function makePage():StudioPageData{return {id:crypto.randomUUID(),title:'Nouvelle page',description:null,questions:[]};}
export function duplicateQuestion(q:StudioQuestion):StudioQuestion{return {...q,id:crypto.randomUUID(),options:q.options.map(o=>({...o,id:crypto.randomUUID()})),settings:{...q.settings}};}
export function duplicatePages(pages:StudioPageData[]):StudioPageData[]{return pages.map(p=>({...p,id:crypto.randomUUID(),questions:p.questions.map(duplicateQuestion)}));}

/** Immutable reordering helper, usable from drag and keyboard controls. */
export function moveQuestionAt<T>(items:readonly T[],from:number,to:number):T[]{
  if(from<0||from>=items.length||to<0||to>=items.length||from===to)return [...items];
  const result=[...items];const [item]=result.splice(from,1);result.splice(to,0,item);return result;
}
