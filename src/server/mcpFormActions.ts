import { FormActions, NotFoundFault, ValidationFault } from './formActions';
import { folderActions } from './folderService';
import { ConflictFault, PermissionFault } from './studioRepository';
import { compiledDraft, mcpCreateFormSchema, mcpFormContentSchema } from '../shared/mcpForm';
import type { FormDetail } from '../shared/formApi';

/** One orchestration layer shared by all new MCP writing tools.
 * The draft is always saved with optimistic revision checks; publication stays separate.
 */
export class McpFormActions {
 constructor(
  readonly forms: Pick<FormActions,'list'|'create'|'get'|'save'|'publish'|'move'|'rename'|'state'> = new FormActions(),
  readonly folders: Pick<typeof folderActions,'list'|'create'|'rename'|'delete'> = folderActions,
 ){}
 private async editable(userId:string,id:string):Promise<FormDetail>{
  const detail=await this.forms.get(userId,id);
  if(detail.role==='viewer')throw new PermissionFault('Lecture seule : aucune modification autorisée');
  return detail;
 }
 private currentDraft(detail:FormDetail){
  const draft=detail.versions.find(v=>v.status==='draft');
  if(!draft)throw new ConflictFault('Aucun brouillon disponible ; actualisez le formulaire');
  return draft;
 }
 /** Build a complete, private form from a single natural-language result.
  * Cleanup when saving/moving fails; no half-built questionnaire remains.
  */
 async createComplete(userId:string,input:unknown){
  const parsed=mcpCreateFormSchema.parse(input);
  // Prevalidate every question and choice before creating anything.
  const pages=compiledDraft({pages:parsed.pages},crypto.randomUUID(),0).pages;
  const created=await this.forms.create(userId,{title:parsed.title});
  try{
   const saved=await this.forms.save(userId,created.id,{
    versionId:created.draftId,expectedRevision:0,pages,
   });
   if(parsed.folderId)await this.forms.move(userId,created.id,{folderId:parsed.folderId});
   return {
    formId:created.id,title:created.title,slug:created.slug,
    draftId:created.draftId,revision:saved.revision,
    pages:pages.length,questions:pages.reduce((n,p)=>n+p.questions.filter(q=>q.type!=='statement').length,0),
    draftUrl:'https://monk-form.netlify.app/studio',
    published:false,
    notice:'Brouillon privé. Non publié. Ouvrez le Studio pour prévisualiser.',
   };
  }catch(error){
   try{await this.forms.state(userId,created.id,{action:'delete'});}catch{ /* original error takes precedence */ }
   throw error;
  }
 }
 async replaceDraft(userId:string,formId:string,expectedRevision:number,input:unknown){
  const parsed=mcpFormContentSchema.parse(input);
  const detail=await this.editable(userId,formId);
  const draft=this.currentDraft(detail);
  if((draft.revision??0)!==expectedRevision)
   throw new ConflictFault('Brouillon modifié ; relisez le formulaire et utilisez sa révision actuelle.');
  const next=compiledDraft(parsed,draft.id,expectedRevision);
  const saved=await this.forms.save(userId,formId,next);
  return {formId,versionId:draft.id,revision:saved.revision,
   pages:next.pages.length,questions:next.pages.reduce((n,p)=>n+p.questions.filter(q=>q.type!=='statement').length,0),
   published:false,
   notice:'Le contenu du brouillon a été remplacé. Les versions publiées sont conservées.',
  };
 }
 async publish(userId:string,formId:string,expectedRevision:number,confirm:boolean){
  if(confirm!==true)throw new ValidationFault('La publication nécessite une confirmation explicite.');
  const detail=await this.editable(userId,formId);
  const draft=this.currentDraft(detail);
  if((draft.revision??0)!==expectedRevision)
   throw new ConflictFault('Brouillon modifié ; relisez le formulaire et confirmez de nouveau.');
  if(!draft.pages.length||!draft.pages.some(p=>p.questions.some(q=>q.type!=='statement')))
   throw new ValidationFault('Ajoutez au moins une question avant de publier.');
  const result=await this.forms.publish(userId,formId,{versionId:draft.id,expectedRevision});
  return {formId,publishedId:result.publishedId,newDraftId:result.draftId,
   publicUrl:'https://monk-form.netlify.app/f/'+encodeURIComponent(detail.slug),
   published:true};
 }
 async move(userId:string,formId:string,folderId:string|null){
  const detail=await this.forms.get(userId,formId);
  if(detail.role!=='owner')throw new PermissionFault('Seul le propriétaire peut classer un formulaire.');
  return this.forms.move(userId,formId,{folderId});
 }
 async rename(userId:string,formId:string,title:string){
  const result=await this.forms.rename(userId,formId,{title});
  if(!result)throw new NotFoundFault('Formulaire introuvable');
  return result;
 }
 /** Existing CRUD is deliberately reused; folders never expose other users’ collections. */
 listFolders(userId:string){return this.folders.list(userId);}
 createFolder(userId:string,name:string){return this.folders.create(userId,{name});}
 renameFolder(userId:string,id:string,name:string){return this.folders.rename(userId,id,{name});}
 deleteFolder(userId:string,id:string){return this.folders.delete(userId,id);}
}
