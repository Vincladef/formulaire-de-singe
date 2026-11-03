import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FormActions } from './formActions';
import { McpFormActions } from './mcpFormActions';
import { mcpCreateFormSchema, mcpFormContentSchema } from '../shared/mcpForm';
import { ConflictFault, PermissionFault } from './studioRepository';
import { ValidationFault, NotFoundFault } from './formActions';

const id=z.string().uuid().describe('UUID of the existing form');
const nonempty=z.string().trim().min(1);
const resource='https://monk-form.netlify.app/mcp';
type McpPermissions={scopes?:readonly string[];linked?:boolean};

function toolResult<T>(data:T){
 return {content:[{type:'text' as const,text:JSON.stringify(data)}]};
}
function toolError(error:unknown){
 const isKnown=error instanceof ValidationFault||error instanceof NotFoundFault
  ||error instanceof ConflictFault||error instanceof PermissionFault||error instanceof z.ZodError;
 const message=isKnown?(error instanceof z.ZodError?'Contenu invalide : '+error.issues.map(i=>i.path.join('.')+': '+i.message).slice(0,6).join(' ; '):error.message)
  :'Opération impossible. Vérifie tes autorisations et réessaie.';
 return {isError:true,content:[{type:'text' as const,text:message}]};
}
function authHint(){
 return {isError:true,content:[{type:'text' as const,text:'Connecte ton compte Monk Form pour utiliser cet outil.'}],
  _meta:{'mcp/www_authenticate':`Bearer resource_metadata="https://monk-form.netlify.app/.well-known/oauth-protected-resource"`}};
}
const security=(scopes:string[])=>({securitySchemes:[{type:'oauth2',scopes}]});

/** Tool catalog is discoverable without identity, but user data and writes require
 * an authenticated, scoped user. Never send a Neon user id from tool arguments.
 */
export function buildMcpServer(
 userId: string|null,
 actions: FormActions = new FormActions(),
 workflow: McpFormActions = new McpFormActions(actions),
 permissions:McpPermissions={linked:!!userId},
) {
 const server = new McpServer({ name:'formulaire-de-singe',version:'1.0.0' });
 const authorized=(scope:'forms:read'|'forms:write'|'forms:publish')=>!!userId&&permissions.linked!==false
  &&(permissions.scopes===undefined||permissions.scopes.includes(scope));
 const register=<T extends z.ZodRawShape>(
  name:string,title:string,description:string,inputSchema:T,scope:'forms:read'|'forms:write'|'forms:publish',
  handler:(args:z.infer<z.ZodObject<T>>)=>Promise<unknown>,
 )=>{
  server.registerTool(name,{
   title,description,inputSchema,
   _meta:security([scope]),
  },async args=>{
   if(!authorized(scope))return authHint();
   try{return toolResult(await handler(args as z.infer<z.ZodObject<T>>));}
   catch(error){return toolError(error);}
  });
 };

 register('list_forms','Lister mes formulaires',
  'Read-only: list the current account’s accessible forms with their folder IDs and publication state.',
  {limit:z.number().int().min(1).max(100).optional()},'forms:read',
  async ({limit})=>actions.list(userId!,limit??100));

 register('get_form','Lire un formulaire',
  'Read-only: retrieve one form, pages, question IDs, revisions and published versions. Use this before updating or publishing.',
  {id},'forms:read',async ({id})=>actions.get(userId!,id));

 register('list_folders','Lister mes dossiers',
  'Read-only: list private form folders owned by the current account.',
  {},'forms:read',async ()=>workflow.listFolders(userId!));

 register('create_form','Créer un formulaire vide',
  'WRITE: create one empty PRIVATE draft; never publish. Prefer create_form_with_content for a complete questionnaire.',
  {title:z.string().trim().min(1).max(200)},'forms:write',
  async ({title})=>actions.create(userId!,{title}));

 register('create_form_with_content','Créer un questionnaire complet',
  'WRITE: create a PRIVATE fully populated draft in one call. Send pages with paragraphs, audio, choices and required fields. Returns its ID and revision, but does NOT publish.',
  mcpCreateFormSchema.shape,'forms:write',
  async args=>workflow.createComplete(userId!,args));

 register('replace_form_draft','Remplacer le contenu d’un brouillon',
  'WRITE: replace ALL pages/questions of the current DRAFT, never published versions. Always call get_form first, use the exact current revision, then preserve data intentionally.',
  {formId:id,expectedRevision:z.number().int().min(0),...mcpFormContentSchema.shape},'forms:write',
  async ({formId,expectedRevision,...content})=>workflow.replaceDraft(userId!,formId,expectedRevision,content));

 register('rename_form','Renommer un formulaire',
  'WRITE: rename an accessible form without touching its answers or published URL.',
  {formId:id,title:z.string().trim().min(1).max(200)},'forms:write',
  async ({formId,title})=>workflow.rename(userId!,formId,title));

 register('create_folder','Créer un dossier',
  'WRITE: create a private folder to organize forms; does not move any form automatically.',
  {name:z.string().trim().min(1).max(80)},'forms:write',
  async ({name})=>workflow.createFolder(userId!,name));

 register('rename_folder','Renommer un dossier',
  'WRITE: rename a private folder.',
  {folderId:z.string().uuid(),name:z.string().trim().min(1).max(80)},'forms:write',
  async ({folderId,name})=>workflow.renameFolder(userId!,folderId,name));

 register('move_form_to_folder','Classer un formulaire',
  'WRITE: move an owned form to a folder. Use null for Sans dossier. Does not affect submissions or published URLs.',
  {formId:id,folderId:z.string().uuid().nullable()},'forms:write',
  async ({formId,folderId})=>workflow.move(userId!,formId,folderId));

 register('publish_form','Publier un formulaire',
  'HIGH IMPACT WRITE: publish the current draft publicly. ONLY call after explicit user approval in this conversation and use confirm=true. Read form/revision first. Returns public URL.',
  {formId:id,expectedRevision:z.number().int().min(0),confirm:z.literal(true).describe('Explicit user permission required; never assume approval')},
  'forms:publish',
  async ({formId,expectedRevision,confirm})=>workflow.publish(userId!,formId,expectedRevision,confirm));

 return server;
}
