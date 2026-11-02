import { sql } from 'drizzle-orm';
import { getDb } from './db/client';

export class ResultsFault extends Error {
 constructor(public status:number,public code:string,message:string){super(message);}
}
export type ResultAnswer={questionId:string;question:string;type:string;value:unknown;audioId:string|null;durationMs:number|null};
export type ResultSubmission={id:string;submittedAt:string|null;answers:ResultAnswer[]};
export type FormResults={formId:string;title:string;slug:string;total:number;page:number;limit:number;submissions:ResultSubmission[]};
export async function getFormResults(userId:string,formId:string,page:number,limit:number):Promise<FormResults>{
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(formId)||!Number.isSafeInteger(page)||page<0||page>100000||
 !Number.isSafeInteger(limit)||limit<1||limit>100)throw new ResultsFault(400,'VALIDATION_ERROR','Paramètres invalides.');
 const db=getDb();
 const access=await db.execute(sql`SELECT f.title,f.slug FROM fs_forms f WHERE f.id=${formId}::uuid
  AND f.deleted_at IS NULL AND (f.owner_id=${userId} OR EXISTS
   (SELECT 1 FROM fs_form_members m WHERE m.form_id=f.id AND m.user_id=${userId}
     AND m.role IN ('viewer','editor'))) LIMIT 1`);
 const form=access.rows[0] as {title:string;slug:string}|undefined;
 if(!form)throw new ResultsFault(404,'NOT_FOUND','Formulaire introuvable.');
 const count=await db.execute(sql`SELECT count(*)::int AS total FROM fs_submissions s
  JOIN fs_versions v ON v.id=s.version_id WHERE v.form_id=${formId}::uuid AND
  s.status='submitted' AND s.deleted_at IS NULL`);
 const total=Number(count.rows[0]?.total??0);
 const result=await db.execute(sql`SELECT s.id AS submission_id,s.submitted_at,a.question_id,
  q.label AS question,q.type,a.value,af.id AS audio_id,af.duration_ms
  FROM (
   SELECT ss.id,ss.submitted_at FROM fs_submissions ss JOIN fs_versions v ON v.id=ss.version_id
   WHERE v.form_id=${formId}::uuid AND ss.status='submitted' AND ss.deleted_at IS NULL
   ORDER BY ss.submitted_at DESC,ss.id DESC LIMIT ${limit} OFFSET ${page*limit}
  ) s LEFT JOIN fs_answers a ON a.submission_id=s.id
  LEFT JOIN fs_questions q ON q.id=a.question_id
  LEFT JOIN fs_audio_files af ON af.answer_id=a.id AND af.status='uploaded' AND af.deleted_at IS NULL
  ORDER BY s.submitted_at DESC,s.id DESC,q.position ASC`);
 const grouped=new Map<string,ResultSubmission>();
 for(const x of result.rows){
  const id=String(x.submission_id);
  if(!grouped.has(id))grouped.set(id,{id,submittedAt:x.submitted_at?new Date(String(x.submitted_at)).toISOString():null,answers:[]});
  if(x.question_id)grouped.get(id)!.answers.push({questionId:String(x.question_id),question:String(x.question??'Question'),
   type:String(x.type??'unknown'),value:x.value,audioId:x.audio_id?String(x.audio_id):null,
   durationMs:x.duration_ms==null?null:Number(x.duration_ms)});
 }
 return {formId,title:form.title,slug:form.slug,total,page,limit,submissions:[...grouped.values()]};
}
