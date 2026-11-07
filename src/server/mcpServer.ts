import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { FormActions } from './formActions';
import { McpFormActions } from './mcpFormActions';
import { McpWorkflowExtras,patchQuestionSchema,cardFields,logicEdit } from './mcpWorkflowExtras';
import { ResultsFault } from './resultsService';
import { getFormAnalytics,getFormAppearance,setFormAppearance,getFormSubmission } from './mcpExtended';
import { formAppearanceSchema } from '../shared/formAppearance';
import { TranscriptionFault } from './transcriptionService';
import { mcpCreateFormSchema, mcpFormContentSchema, mcpQuestionSchema } from '../shared/mcpForm';
import { ConflictFault, PermissionFault } from './studioRepository';
import { ValidationFault, NotFoundFault } from './formActions';

const id=z.string().uuid().describe('UUID of the existing form');
type McpPermissions={scopes?:readonly string[];linked?:boolean};

function toolResult<T>(data:T):CallToolResult{
 return {content:[{type:'text' as const,text:JSON.stringify(data)}]};
}
function toolError(error:unknown):CallToolResult{
 const isKnown=error instanceof ValidationFault||error instanceof NotFoundFault
  ||error instanceof ConflictFault||error instanceof PermissionFault||error instanceof ResultsFault||error instanceof TranscriptionFault||error instanceof z.ZodError;
 const message=isKnown?(error instanceof z.ZodError?'Contenu invalide : '+error.issues.map(i=>i.path.join('.')+': '+i.message).slice(0,6).join(' ; '):error.message)
  :'Opération impossible. Vérifie tes autorisations et réessaie.';
 return {isError:true,content:[{type:'text' as const,text:message}]};
}
function authHint():CallToolResult{
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
 extra:McpWorkflowExtras=new McpWorkflowExtras(),
) {
 const server = new McpServer({ name:'formulaire-de-singe',version:'1.1.0' });
 const authorized=(scope:'forms:read'|'forms:write'|'forms:publish')=>!!userId&&permissions.linked!==false
  &&(permissions.scopes===undefined||permissions.scopes.includes(scope));
 const register=<T extends z.ZodRawShape>(
  name:string,title:string,description:string,inputSchema:T,scope:'forms:read'|'forms:write'|'forms:publish',
  handler:(args:z.infer<z.ZodObject<T>>)=>Promise<unknown>,
 )=>{
  // SDK v1 tool callback uses a broad ShapeOutput generic. Validate the
  // exact schema at runtime before passing it to our strongly typed handler.
  const callback=async (args:Record<string,unknown>):Promise<CallToolResult>=>{
   if(!authorized(scope))return authHint();
   try{
    const parsed=z.object(inputSchema).parse(args) as z.infer<z.ZodObject<T>>;
    return toolResult(await handler(parsed));
   }catch(error){return toolError(error);}
  };
  server.registerTool(name,{
   title,description,inputSchema,
   _meta:security([scope]),
  },callback as unknown as Parameters<typeof server.registerTool>[2]);
 };

 register('list_forms','Lister mes formulaires',
  'Read-only: list the current account’s accessible forms with their folder IDs and publication state.',
  {limit:z.number().int().min(1).max(100).optional()},'forms:read',
  async ({limit})=>actions.list(userId!,limit??100));

 register('get_form','Lire un formulaire sans données inutiles',
  'Read-only: returns the current draft by default with question IDs and metadata, but without enormous embedded image data. Set version=published/all to inspect history, includeMedia=true ONLY when full base64 images are absolutely necessary.',
  {id,version:z.enum(['draft','published','all']).default('draft').optional(),
   includeMedia:z.boolean().default(false).optional()},'forms:read',
  async ({id,version,includeMedia})=>extra.get(userId!,id,{version,includeMedia}));

 register('get_form_summary','Résumé rapide du formulaire',
  'Read-only: lightweight summary: title, URL, version IDs, draft revision, number of pages and questions; no image payload. Call FIRST before editing.',
  {formId:id},'forms:read',async ({formId})=>extra.summary(userId!,formId));

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

 register('update_form_question','Modifier une question sans remplacer le formulaire',
  'WRITE: precise update of a single existing draft question while retaining every other question, photo and rule. First use get_form; send latest expectedRevision. Supports text, help, required, choices, audio options, and rich HTML statements.',
  {formId:id,questionId:id,expectedRevision:z.number().int().min(0),...patchQuestionSchema.shape},'forms:write',
  async ({formId,questionId,expectedRevision,...patch})=>extra.updateQuestion(userId!,formId,expectedRevision,questionId,patch));

 register('set_choice_card','Modifier une carte illustrée et son tarif',
  'WRITE: add or edit one option card with an HTTPS image, free/paid price, description, place, date, reservation requirements and official link. No full-form replacement, no base64 uploads.',
  {formId:id,questionId:id,expectedRevision:z.number().int().min(0),
   optionLabel:z.string().min(1).max(180),...cardFields.shape},'forms:write',
  async ({formId,questionId,expectedRevision,optionLabel,...patch})=>extra.updateChoiceCard(userId!,formId,expectedRevision,questionId,optionLabel,patch));

 register('set_choice_cards_bulk','Configurer toutes les cartes en une opération',
  'WRITE: update images, prices, notes, dates, locations, descriptions and official URLs on several options at once in ONE draft revision. Ideal for weekly event galleries; keeps the rest of the form intact.',
  {formId:id,questionId:id,expectedRevision:z.number().int().min(0),
   cards:z.array(z.object({optionLabel:z.string().min(1).max(180),...cardFields.shape}).strict()).min(1).max(100)},'forms:write',
  async ({formId,questionId,expectedRevision,cards})=>extra.updateChoiceCards(userId!,formId,expectedRevision,questionId,cards));

 register('add_form_question','Ajouter une question à une page',
  'WRITE: insert one new question in an existing draft page. Options can be photo-rich cards. All other questions preserved. Configure conditional logic separately with set_question_logic.',
  {formId:id,pageId:id,expectedRevision:z.number().int().min(0),
   position:z.number().int().min(0).max(149).optional(),question:mcpQuestionSchema},'forms:write',
  async ({formId,pageId,expectedRevision,position,question})=>extra.addQuestion(userId!,formId,expectedRevision,pageId,question,position));

 register('remove_form_question','Supprimer une question de brouillon',
  'DESTRUCTIVE DRAFT WRITE: remove exactly one question only after explicit user approval and confirm=true; leaves published versions and answers untouched, but invalid references are rejected.',
  {formId:id,questionId:id,expectedRevision:z.number().int().min(0),confirm:z.literal(true)},'forms:write',
  async ({formId,questionId,expectedRevision,confirm})=>extra.removeQuestion(userId!,formId,expectedRevision,questionId,confirm));

 register('set_question_logic','Logique conditionnelle pour une question',
  'WRITE: configure show/hide, requiredWhen, and forward page redirects. Refer to earlier questions by UUID and to choices by their readable labels; supports AND/OR. Null clears only that rule. Auto-validates paths and blocks invalid references.',
  {formId:id,questionId:id,expectedRevision:z.number().int().min(0),...logicEdit.shape},'forms:write',
  async ({formId,questionId,expectedRevision,...logic})=>extra.setLogic(userId!,formId,expectedRevision,questionId,logic));

 register('add_form_page','Ajouter une page au brouillon',
  'WRITE: add a new page without affecting existing pages or images; configure its questions separately.',
  {formId:id,expectedRevision:z.number().int().min(0),
   title:z.string().max(200),description:z.string().max(3000).nullable().optional()},'forms:write',
  async ({formId,expectedRevision,title,description})=>extra.addPage(userId!,formId,expectedRevision,title,description));

 register('update_form_page','Modifier le titre ou l’introduction d’une page',
  'WRITE: edit only a page title or description without rebuilding the form.',
  {formId:id,pageId:id,expectedRevision:z.number().int().min(0),
   title:z.string().max(200).optional(),description:z.string().max(3000).nullable().optional()},'forms:write',
  async ({formId,pageId,expectedRevision,title,description})=>extra.updatePage(userId!,formId,expectedRevision,pageId,{title,description}));

 register('remove_form_page','Supprimer une page avec confirmation',
  'DESTRUCTIVE DRAFT WRITE: remove one page and its draft questions after explicit approval and confirm=true. Leaves published versions intact; rejects broken conditional references.',
  {formId:id,pageId:id,expectedRevision:z.number().int().min(0),confirm:z.literal(true)},'forms:write',
  async ({formId,pageId,expectedRevision,confirm})=>extra.deletePage(userId!,formId,expectedRevision,pageId,confirm));

 register('move_form_question','Déplacer une question dans une page',
  'WRITE: reorder a question, or move it to another page, by UUID and zero-based position. All rules are checked for broken references.',
  {formId:id,questionId:id,targetPageId:id,position:z.number().int().min(0).max(149),
   expectedRevision:z.number().int().min(0)},'forms:write',
  async ({formId,questionId,targetPageId,position,expectedRevision})=>
   extra.moveQuestion(userId!,formId,expectedRevision,questionId,targetPageId,position));

 register('delete_form','Supprimer un formulaire avec confirmation',
  'HIGH IMPACT DESTRUCTIVE: owner-only logical deletion, disables public form access. Requires explicit approval in chat and confirm=true. Never use for tests.',
  {formId:id,confirm:z.literal(true)},'forms:write',
  async ({formId,confirm})=>extra.deleteForm(userId!,formId,confirm));

 register('preview_form_path','Simuler un parcours sans envoyer de réponse',
  'Read-only: simulate choices by question ID and visible option labels; returns only the reached pages and visible/required questions. Never submits responses or changes the form.',
  {formId:id,answers:z.array(z.object({
   questionId:id,value:z.union([z.string(),z.array(z.string()).max(100)]),
  }).strict()).max(150).default([])},'forms:read',
  async ({formId,answers})=>extra.preview(userId!,formId,answers));

 register('list_form_results','Consulter les réponses, transcriptions incluses',
  'Read-only: paginated participant responses with question labels, values, and audio transcription status. page is 0-based and limit <=100. Existing submissions are never changed.',
  {formId:id,page:z.number().int().min(0).max(100000).default(0),limit:z.number().int().min(1).max(100).default(20)},'forms:read',
  async ({formId,page,limit})=>extra.results(userId!,formId,page,limit));

 register('get_sheets_status','Voir la connexion Google Sheets',
  'Read-only: check whether the form is linked to a Google Sheet and inspect its synchronization state.',
  {formId:id},'forms:read',async ({formId})=>extra.sheetsStatus(userId!,formId));

 register('sync_form_to_sheets','Synchroniser les réponses vers Google Sheets',
  'WRITE EXTERNAL: only after the user explicitly requests the sync; confirm=true. Reuses existing connected account; never creates unrelated spreadsheets.',
  {formId:id,confirm:z.literal(true)},'forms:write',
  async ({formId,confirm})=>extra.sheetsSync(userId!,formId,confirm));

 register('get_transcription_status','État de transcription des réponses audio',
  'Read-only: count queued, transcribed and failed audio recordings for a form.',
  {formId:id},'forms:read',async ({formId})=>extra.transcriptionStatus(userId!,formId));

 register('transcribe_remaining_audio','Transcrire les audios restants',
  'WRITE EXTERNAL: enqueue nontranscribed audio recordings with Cloudflare; confirm=true and explicit user request. Does not call paid third-party AI APIs.',
  {formId:id,confirm:z.literal(true)},'forms:write',
  async ({formId,confirm})=>extra.transcribeRemaining(userId!,formId,confirm));

 register('duplicate_form','Dupliquer un formulaire en brouillon privé',
  'WRITE: create an unshared, unpublished copy of a form preserving content and conditional references. Does not modify the original.',
  {formId:id},'forms:write',async ({formId})=>extra.duplicate(userId!,formId));

 register('set_form_archive','Archiver ou restaurer un formulaire',
  'HIGH IMPACT WRITE: archive/unarchive one existing form only on explicit user instruction with confirm=true. Published URL state and submissions may be affected.',
  {formId:id,action:z.enum(['archive','unarchive']),confirm:z.literal(true)},'forms:write',
  async ({formId,action,confirm})=>extra.archive(userId!,formId,action,confirm));

 register('get_form_analytics','Statistiques des réponses',
  'READ-ONLY: exact submitted-response counts, daily trend in Europe/Paris, multiple-choice frequency and numeric averages. No tracking pixels or invented view/conversion data.',
  {formId:id,days:z.union([z.literal(7),z.literal(30),z.literal(90),z.literal(365)]).default(30)},
  'forms:read',async ({formId,days})=>getFormAnalytics(userId!,formId,days));

 register('get_submission','Lire une participation précise',
  'READ-ONLY: inspect a single submitted response by UUID, with all question answers, audio IDs, transcript and transcription status; does not expose private storage keys.',
  {formId:id,submissionId:id},'forms:read',
  async ({formId,submissionId})=>getFormSubmission(userId!,formId,submissionId));

 register('get_form_appearance','Lire le thème du formulaire',
  'READ-ONLY: inspect colors, font and thank-you texts currently configured. Settings apply immediately to public forms.',
  {formId:id},'forms:read',async ({formId})=>getFormAppearance(userId!,formId));

 register('set_form_appearance','Personnaliser le thème et le remerciement',
  'WRITE: modify only the specified color, font or thank-you field. Changes are immediately live on a published form: use only after explicit user instruction. All other settings are preserved.',
  {formId:id,...formAppearanceSchema.shape},'forms:write',
  async ({formId,...appearance})=>setFormAppearance(userId!,formId,appearance));

 register('publish_form','Publier un formulaire',
  'HIGH IMPACT WRITE: publish the current draft publicly. ONLY call after explicit user approval in this conversation and use confirm=true. Read form/revision first. Returns public URL.',
  {formId:id,expectedRevision:z.number().int().min(0),confirm:z.literal(true).describe('Explicit user permission required; never assume approval')},
  'forms:publish',
  async ({formId,expectedRevision,confirm})=>workflow.publish(userId!,formId,expectedRevision,confirm));

 return server;
}
