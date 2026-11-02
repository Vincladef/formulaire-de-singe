import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FormActions } from './formActions';
import { McpApplication, formIdField, newQuestion, questionPatch, filterSchema, titleSchema, uuid, formPatch } from './mcpActions';
import { NeonResultsService, type ResultsService } from './resultsRepository';
import { NeonAudioService, type AudioService } from './audioService';

/** Eleven MCP tools using the same business services as REST. No direct privileged SQL in tools. */
export function buildMcpServer(userId:string,actions:FormActions=new FormActions(),services?:{results?:ResultsService;audio?:AudioService}){
 const app=new McpApplication(actions,services?.results??new NeonResultsService(),services?.audio??new NeonAudioService());
 const server=new McpServer({name:'formulaire-de-singe',version:'0.9.0'});
 const result=async<T>(f:()=>Promise<T>|T)=>{
  try{const data=await f();return {structuredContent:{ok:true,data},content:[{type:'text' as const,text:JSON.stringify({ok:true,data})}]};}
  catch(e){const known=e instanceof Error&&('status' in e||e.name==='ZodError');const code=known&&'code' in e?String(e.code):known?'VALIDATION_ERROR':'UNAVAILABLE';const message=known&&e instanceof Error?e.message:'Service indisponible ou accès interdit';
   return {isError:true,structuredContent:{ok:false,error:{code,message}},content:[{type:'text' as const,text:JSON.stringify({ok:false,error:{code,message}})}]};}
 };
 server.tool('list_forms','Liste les formulaires accessibles à l’utilisateur authentifié. Lecture seule.',{limit:z.number().int().min(1).max(100).optional()},({limit})=>result(()=>app.listForms(userId,limit)));
 server.tool('get_form','Lit la structure, les versions et les pages autorisées du formulaire.',{id:uuid},({id})=>result(()=>app.getForm(userId,id)));
 server.tool('create_form','Crée un formulaire privé en brouillon. Ne publie rien.',{title:titleSchema},({title})=>result(()=>app.createForm(userId,title)));
 server.tool('update_form','Modifie le titre ou le thème du formulaire. Nécessite le rôle éditeur.',{...formIdField,...formPatch.shape},({formId,...patch})=>result(()=>app.updateForm(userId,formId,patch)));
 server.tool('add_questions','Ajoute 1 à 25 questions au brouillon, sur la page indiquée ou la première page. Pour choisir la page et connaître la révision, appeler get_form.',{...formIdField,pageId:uuid.optional(),expectedRevision:z.number().int().min(0).optional(),questions:z.array(newQuestion).min(1).max(25)},({formId,...input})=>result(()=>app.addQuestions(userId,formId,input)));
 server.tool('update_question','Modifie une question du brouillon sans toucher aux versions publiées. Les options remplacent les anciennes.',{...formIdField,questionId:uuid,expectedRevision:z.number().int().min(0).optional(),patch:questionPatch},({formId,...input})=>result(()=>app.updateQuestion(userId,formId,input)));
 server.tool('publish_form','ACTION PUBLIQUE. Montrer d’abord le formulaire au propriétaire et obtenir son accord explicite avant cette action. Ne jamais publier de façon autonome.',{...formIdField,expectedRevision:z.number().int().min(0).optional(),confirmPublication:z.literal(true)},({formId,...input})=>result(()=>app.publishForm(userId,formId,input)));
 server.tool('list_submissions','Liste les participations et statistiques après contrôle des permissions. Données privées.',{...formIdField,...filterSchema.shape},({formId,...filter})=>result(()=>app.listSubmissions(userId,formId,filter)));
 server.tool('get_submission','Lit les réponses d’une participation autorisée.',{...formIdField,submissionId:uuid},({formId,submissionId})=>result(()=>app.getSubmission(userId,formId,submissionId)));
 server.tool('get_audio','Obtient une URL R2 signée de lecture valable 60 secondes uniquement pour un audio autorisé. Aucune URL permanente.',{audioId:uuid},({audioId})=>result(()=>app.getAudio(userId,audioId)));
 server.tool('export_results','Exporte les réponses autorisées en CSV ou JSON dans une limite de 100 Ko. Les ZIP se téléchargent depuis le Studio.',{...formIdField,format:z.enum(['csv','json']),...filterSchema.shape},({formId,format,...filter})=>result(()=>app.exportResults(userId,formId,filter,format)));
 return server;
}
