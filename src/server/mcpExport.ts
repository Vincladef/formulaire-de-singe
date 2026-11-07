import { getFormResults,type FormResults } from './resultsService';

/** Spreadsheet-safe CSV: prevent formula execution when opened in Excel/Sheets. */
export function csvCell(input:unknown){
 const value=typeof input==='string'?input:input==null?'':JSON.stringify(input);
 const safe=/^[\s]*[=+@-]/.test(value)?"'"+value:value;
 return '"'+safe.replace(/"/g,'""')+'"';
}
export function resultsCsv(results:FormResults,includeTranscripts:boolean){
 const keys=new Map<string,string>();
 for(const submission of results.submissions)for(const answer of submission.answers){
  if(!keys.has(answer.questionId))keys.set(answer.questionId,answer.question);
 }
 const ordered=[...keys.keys()];
 const columns=['submission_id','submitted_at_paris',...ordered.flatMap(k=>[
  keys.get(k)+' ['+k+']',...(includeTranscripts?[keys.get(k)+' [transcription '+k+']']:[]),
 ])];
 const rows=results.submissions.map(submission=>{
  const date=submission.submittedAt?new Intl.DateTimeFormat('fr-FR',{
   timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',
   minute:'2-digit',second:'2-digit',hour12:false,
  }).format(new Date(submission.submittedAt)):'';
  const values=[submission.id,date];
  for(const id of ordered){
   const answer=submission.answers.find(x=>x.questionId===id);
   values.push(answer?.value===undefined?'':answer.value as string);
   if(includeTranscripts)values.push(answer?.transcript??'');
  }
  return values.map(csvCell).join(',');
 });
 return [columns.map(csvCell).join(','),...rows].join('\r\n');
}
export async function exportFormResults(userId:string,formId:string,page:number,limit:number,
 format:'csv'|'json',includeTranscripts:boolean){
 // getFormResults verifies current user's ownership or membership.
 const result=await getFormResults(userId,formId,page,limit);
 const nextPage=(page+1)*limit<result.total?page+1:null;
 if(format==='json')return {...result,nextPage,timezone:'Europe/Paris',
  submissions:result.submissions.map(s=>({...s,answers:s.answers.map(a=>({
   ...a,...(!includeTranscripts?{transcript:undefined,transcriptionError:undefined}:{}),
  }))}))};
 return {formId,title:result.title,format:'csv',page,limit,total:result.total,nextPage,
  timezone:'Europe/Paris',content:resultsCsv(result,includeTranscripts),
  warning:'Valeurs exportées telles qu’enregistrées, y compris les identifiants techniques des choix.'};
}
