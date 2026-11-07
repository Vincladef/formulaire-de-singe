import { sql } from 'drizzle-orm';
import { getDb } from './db/client';
import { NotFoundFault, ValidationFault } from './formActions';
import { PermissionFault } from './studioRepository';
import { formAppearanceSchema,readFormAppearance,type FormAppearance } from '../shared/formAppearance';

/** Enforce ownership or membership on every report, without exposing owner IDs. */
async function access(userId:string,formId:string){
 const db=getDb();
 const found=await db.execute(sql`SELECT f.id,f.slug,f.title,f.settings,
   CASE WHEN f.owner_id=${userId} THEN 'owner' ELSE
    (SELECT m.role FROM fs_form_members m WHERE m.form_id=f.id AND m.user_id=${userId} LIMIT 1) END AS role
   FROM fs_forms f WHERE f.id=${formId}::uuid AND f.deleted_at IS NULL
   AND (f.owner_id=${userId} OR EXISTS(
    SELECT 1 FROM fs_form_members m WHERE m.form_id=f.id AND m.user_id=${userId}
    AND m.role IN ('editor','viewer'))) LIMIT 1`);
 const row=found.rows[0];
 if(!row)throw new NotFoundFault('Formulaire inaccessible ou introuvable');
 return {id:String(row.id),slug:String(row.slug),title:String(row.title),
  settings:row.settings,role:String(row.role)};
}
export async function getFormAppearance(userId:string,formId:string){
 const form=await access(userId,formId);
 return {formId,title:form.title,appearance:readFormAppearance(form.settings),
  notice:'La présentation des formulaires publiés se met à jour immédiatement.'};
}
export async function setFormAppearance(userId:string,formId:string,patch:FormAppearance){
 const parsed=formAppearanceSchema.parse(patch);
 if(Object.keys(parsed).length===0)throw new ValidationFault('Précisez au moins un paramètre de présentation');
 const form=await access(userId,formId);
 if(form.role==='viewer')throw new PermissionFault('Modification interdite en lecture seule');
 const db=getDb();
 // Atomic JSONB patch. Preserve other form settings and unmodified appearance fields.
 // Repeat authorization in the UPDATE to avoid a read/write privilege race.
 const changed=await db.execute(sql`UPDATE fs_forms f SET
   settings=jsonb_set(f.settings,'{appearance}',
     COALESCE(f.settings->'appearance','{}'::jsonb) || ${JSON.stringify(parsed)}::jsonb,true),
   updated_at=now()
   WHERE f.id=${formId}::uuid AND f.deleted_at IS NULL AND f.archived_at IS NULL
   AND (f.owner_id=${userId} OR EXISTS(
      SELECT 1 FROM fs_form_members m WHERE m.form_id=f.id
      AND m.user_id=${userId} AND m.role='editor'))
   RETURNING f.settings`);
 if(!changed.rows.length)throw new PermissionFault('Formulaire archivé ou modification refusée');
 return {formId,appearance:readFormAppearance(changed.rows[0].settings),
  liveImmediately:true,notice:'Le thème est enregistré. Les modifications sont visibles sur la page publique, si le formulaire est publié.'};
}

/** Read one submission, including audio metadata/transcripts but NEVER storage keys. */
export async function getFormSubmission(userId:string,formId:string,submissionId:string){
 const form=await access(userId,formId);
 const db=getDb();
 const data=await db.execute(sql`SELECT s.id AS submission_id,s.submitted_at,
   a.question_id,q.label AS question,q.type,a.value,
   af.id AS audio_id,af.duration_ms,af.transcript,job.status AS transcription_status
   FROM fs_submissions s JOIN fs_versions v ON v.id=s.version_id
   LEFT JOIN fs_answers a ON a.submission_id=s.id
   LEFT JOIN fs_questions q ON q.id=a.question_id
   LEFT JOIN fs_audio_files af ON af.answer_id=a.id AND af.status='uploaded' AND af.deleted_at IS NULL
   LEFT JOIN fs_audio_transcription_jobs job ON job.audio_id=af.id
   WHERE s.id=${submissionId}::uuid AND v.form_id=${formId}::uuid
    AND s.status='submitted' AND s.deleted_at IS NULL
   ORDER BY q.position ASC`);
 if(!data.rows.length)throw new NotFoundFault('Réponse introuvable');
 const date=data.rows[0].submitted_at;
 return {formId,formTitle:form.title,submissionId,submittedAt:date?new Date(String(date)).toISOString():null,
  answers:data.rows.filter(r=>r.question_id).map(r=>({
   questionId:String(r.question_id),question:String(r.question??'Question'),
   type:String(r.type??'unknown'),value:r.value,
   audioId:r.audio_id?String(r.audio_id):null,
   durationMs:r.duration_ms==null?null:Number(r.duration_ms),
   transcript:r.transcript==null?null:String(r.transcript),
   transcriptionStatus:r.transcription_status==null?null:String(r.transcription_status),
  }))};
}

/** Exact submitted-only aggregates; no tracking pixels and no fabricated visit statistics. */
export async function getFormAnalytics(userId:string,formId:string,days:7|30|90|365){
 const form=await access(userId,formId);
 const db=getDb();
 const [counts,trend,questionStats,choices,numbers]=await Promise.all([
  db.execute(sql`SELECT count(*)::int AS total,
     count(*) FILTER (WHERE s.submitted_at>=now()-${days}::int*interval '1 day')::int AS period_total,
     min(s.submitted_at) AS first_submission,max(s.submitted_at) AS last_submission
    FROM fs_submissions s JOIN fs_versions v ON v.id=s.version_id
    WHERE v.form_id=${formId}::uuid AND s.status='submitted' AND s.deleted_at IS NULL`),
  db.execute(sql`SELECT to_char(s.submitted_at AT TIME ZONE 'Europe/Paris','YYYY-MM-DD') AS day,
     count(*)::int AS submissions FROM fs_submissions s
    JOIN fs_versions v ON v.id=s.version_id
    WHERE v.form_id=${formId}::uuid AND s.status='submitted' AND s.deleted_at IS NULL
     AND s.submitted_at>=now()-${days}::int*interval '1 day'
    GROUP BY 1 ORDER BY 1 ASC`),
  db.execute(sql`SELECT q.id AS question_id,q.label AS question,q.type,
     count(s.id)::int AS responses
    FROM fs_questions q JOIN fs_pages p ON p.id=q.page_id
    JOIN fs_versions v ON v.id=p.version_id
    LEFT JOIN fs_answers a ON a.question_id=q.id
    LEFT JOIN fs_submissions s ON s.id=a.submission_id AND s.status='submitted'
      AND s.deleted_at IS NULL AND s.submitted_at>=now()-${days}::int*interval '1 day'
    WHERE v.form_id=${formId}::uuid AND v.status='published' AND q.type<>'statement'
    GROUP BY q.id,q.label,q.type ORDER BY q.label LIMIT 400`),
  db.execute(sql`SELECT q.id AS question_id,coalesce(o.label,choice.value) AS choice,
     count(*)::int AS count FROM fs_answers a
    JOIN fs_questions q ON q.id=a.question_id
    JOIN fs_pages p ON p.id=q.page_id JOIN fs_versions v ON v.id=p.version_id
    JOIN fs_submissions s ON s.id=a.submission_id
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(a.value)='array' THEN a.value
      WHEN jsonb_typeof(a.value)='string' THEN jsonb_build_array(a.value)
      ELSE '[]'::jsonb END) choice(value)
    LEFT JOIN fs_question_options o ON o.question_id=q.id AND o.value=choice.value
    WHERE v.form_id=${formId}::uuid AND q.type IN ('single_choice','multiple_choice','select')
      AND s.status='submitted' AND s.deleted_at IS NULL
      AND s.submitted_at>=now()-${days}::int*interval '1 day'
    GROUP BY q.id,o.label,choice.value ORDER BY count(*) DESC LIMIT 2000`),
  db.execute(sql`SELECT q.id AS question_id,round(avg((a.value #>> '{}')::numeric),2) AS mean,
    min((a.value #>> '{}')::numeric) AS minimum,max((a.value #>> '{}')::numeric) AS maximum,
    count(*)::int AS count
    FROM fs_answers a JOIN fs_questions q ON q.id=a.question_id
    JOIN fs_pages p ON p.id=q.page_id JOIN fs_versions v ON v.id=p.version_id
    JOIN fs_submissions s ON s.id=a.submission_id
    WHERE v.form_id=${formId}::uuid AND q.type='number' AND jsonb_typeof(a.value)='number'
    AND s.status='submitted' AND s.deleted_at IS NULL
    AND s.submitted_at>=now()-${days}::int*interval '1 day'
    GROUP BY q.id LIMIT 400`),
 ]);
 const countRow=counts.rows[0];
 const items=questionStats.rows.map(q=>{
  const matched=numbers.rows.find(n=>String(n.question_id)===String(q.question_id));
  return {questionId:String(q.question_id),label:String(q.question),type:String(q.type),
   responses:Number(q.responses),choices:choices.rows.filter(c=>String(c.question_id)===String(q.question_id))
     .map(c=>({label:String(c.choice),count:Number(c.count)})),
   numeric:matched?{count:Number(matched.count),mean:Number(matched.mean),
    min:Number(matched.minimum),max:Number(matched.maximum)}:null};
 });
 return {formId,title:form.title,days,timezone:'Europe/Paris',
  submissions:{allTime:Number(countRow?.total??0),period:Number(countRow?.period_total??0),
   first:countRow?.first_submission?new Date(String(countRow.first_submission)).toISOString():null,
   last:countRow?.last_submission?new Date(String(countRow.last_submission)).toISOString():null},
  daily:trend.rows.map(x=>({date:String(x.day),count:Number(x.submissions)})),questions:items,
  truncated:questionStats.rows.length>=400||choices.rows.length>=2000,
  limitations:'Statistiques basées uniquement sur les soumissions validées. Aucune mesure des visites, des abandons ou du taux de conversion.'};
}
