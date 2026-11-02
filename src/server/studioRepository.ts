import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from './db/client';
import { forms } from './db/schema';
import { formRepository } from './formRepository';
import { folderActions } from './folderService';
import type { DraftPayload, StudioPageData } from '../shared/studio';

export class ConflictFault extends Error {status=409;code='CONFLICT' as const;}
export class PermissionFault extends Error {status=403;code='FORBIDDEN' as const;}
const writable = (userId:string) => sql`( ${forms.ownerId} = ${userId} OR EXISTS (
  SELECT 1 FROM fs_form_members m WHERE m.form_id = ${forms.id} AND m.user_id=${userId} AND m.role='editor'
))`;
const owned=(userId:string)=>eq(forms.ownerId,userId);
const dbError=(error:unknown):never=>{
  const message=error instanceof Error? error.message : String(error);
  if (/REVISION_CONFLICT|40001/i.test(message)) throw new ConflictFault('Le brouillon a changé dans un autre onglet. Rechargez avant de continuer.');
  if (/DRAFT_NOT_FOUND|NOT_FOUND_OR_FORBIDDEN|P0002/i.test(message)) throw new PermissionFault('Formulaire inaccessible ou modification interdite');
  throw error;
};

export async function saveDraft(userId:string,formId:string,input:DraftPayload) {
  try{
    const db=getDb();
    const result=await db.execute(sql`SELECT fs_save_draft(${formId}::uuid,${userId},${input.versionId}::uuid,
        ${input.expectedRevision},${JSON.stringify(input.pages)}::jsonb) AS revision`);
    return {versionId:input.versionId,revision:Number(result.rows[0]?.revision)};
  }catch(error){return dbError(error);}
}
export async function publish(userId:string,formId:string,versionId:string,revision:number){
  try{
    const db=getDb();
    const result=await db.execute(sql`SELECT fs_publish_and_fork(${formId}::uuid,${userId},${versionId}::uuid,${revision}) AS draft_id`);
    return {publishedId:versionId,draftId:String(result.rows[0]?.draft_id)};
  }catch(error){return dbError(error);}
}
export async function setFormState(userId:string,id:string,action:'archive'|'unarchive'|'delete'){
  const db=getDb();
  const changes=action==='archive'? {archivedAt:sql`now()`,updatedAt:sql`now()`}
    :action==='unarchive'? {archivedAt:sql`null`,updatedAt:sql`now()`} :{deletedAt:sql`now()`,updatedAt:sql`now()`};
  const [result]=await db.update(forms).set(changes)
    .where(and(eq(forms.id,id),isNull(forms.deletedAt),action==='delete'?owned(userId):writable(userId)))
    .returning({id:forms.id});
  return result ? {id:result.id,action} : null;
}
export async function duplicateForm(userId:string,id:string){
  const original=await formRepository.get(userId,id);
  if(!original) return null;
  const source=original.versions.find(v=>v.status==='draft') ?? original.versions.find(v=>v.status==='published');
  const created=await formRepository.create(userId,`Copie de ${original.title}`.slice(0,200));
  if(original.role==='owner'&&original.folderId)await folderActions.move(userId,created.id,{folderId:original.folderId});
  if(!source || source.pages.length===0) return created;
  const pages:StudioPageData[]=source.pages.map(p=>({
    id:crypto.randomUUID(),title:p.title,description:p.description,
    questions:p.questions.map(q=>({
      id:crypto.randomUUID(),type:q.type as StudioPageData['questions'][number]['type'],label:q.label,
      description:q.description,required:q.required,settings:q.settings,
      options:q.options.map(o=>({id:crypto.randomUUID(),value:o.value,label:o.label})),
    })),
  }));
  try{await saveDraft(userId,created.id,{versionId:created.draftId,expectedRevision:0,pages});}
  catch(error){await setFormState(userId,created.id,'delete');throw error;}
  return created;
}
