import { sql } from 'drizzle-orm';
import { getDb } from './db/client';
import type { ResultsFilter, ResultsOverview, ResultsQuestion, ResultsSubmission, SubmissionDetail, ResultAnswer } from '../shared/results';
import { R2AudioStorage, type AudioStorage } from './audioStorage';
import { csvOfSubmissions, exportJson } from '../shared/results';
import { zipSync, strToU8 } from 'fflate';

export class ResultsFault extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const missing = () => new ResultsFault(404, 'NOT_FOUND', 'Formulaire ou participation introuvable.');
const maximumExport = 1000;
const maxZipBytes = 16 * 1024 * 1024; // Netlify response/memory guard, see README.
const suffix = (mime: string) => ({'audio/webm':'webm','audio/ogg':'ogg','audio/mp4':'m4a','audio/x-m4a':'m4a','audio/mpeg':'mp3','audio/wav':'wav','audio/aac':'aac'}[mime] ?? 'bin');
const iso = (value: unknown) => value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();

/** All private access flows through this permission check, including export and delete. */
async function requireForm(userId: string, formId: string, write = false, ownerOnly = false) {
  const db = getDb();
  const rows = await db.execute(sql`SELECT f.id,f.title,f.owner_id FROM fs_forms f
    WHERE f.id=${formId}::uuid AND f.deleted_at IS NULL
    AND (f.owner_id=${userId} OR (${!ownerOnly} AND EXISTS (
      SELECT 1 FROM fs_form_members m WHERE m.form_id=f.id AND m.user_id=${userId}
        AND (${!write} OR m.role='editor')))) LIMIT 1`);
  if (!rows.rows[0]) throw missing();
  return rows.rows[0] as {id:string;title:string;owner_id:string};
}

export interface ResultsService {
  overview(userId: string, formId: string, filters: ResultsFilter): Promise<ResultsOverview>;
  submission(userId: string, formId: string, submissionId: string): Promise<SubmissionDetail>;
  question(userId: string, formId: string, questionId: string, filters: ResultsFilter): Promise<{total:number;answers: {submissionId:string;submittedAt:string;answer:ResultAnswer}[]}>;
  export(userId: string, formId: string, filters: ResultsFilter, format: 'csv'|'json'|'zip'): Promise<{content:Uint8Array|string;contentType:string;filename:string}>;
  transcript(userId:string, formId:string, audioId:string, text:string, source:'whisper'|'noscribe'|'other'):Promise<{id:string;updated:boolean}>;
  removeSubmission(userId:string, formId:string, submissionId:string):Promise<{deleted:boolean;pendingAudioCleanup:number}>;
}

export class NeonResultsService implements ResultsService {
  constructor(private storage: AudioStorage = new R2AudioStorage()) {}
  private async versions(formId:string) {
    const rows=await getDb().execute(sql`SELECT id,number,published_at FROM fs_versions WHERE form_id=${formId}::uuid AND status='published' ORDER BY number DESC`);
    return rows.rows.map(r=>({id:String(r.id),number:Number(r.number),publishedAt:r.published_at?iso(r.published_at):null}));
  }
  private conditions(formId:string,f:ResultsFilter){
    return sql`JOIN fs_versions v ON v.id=s.version_id
      WHERE v.form_id=${formId}::uuid AND s.status='submitted' AND s.deleted_at IS NULL
      AND (${f.versionId??null}::uuid IS NULL OR s.version_id=${f.versionId??null}::uuid)
      AND (${f.from??null}::date IS NULL OR s.submitted_at >= ${f.from??null}::date)
      AND (${f.to??null}::date IS NULL OR s.submitted_at < (${f.to??null}::date + INTERVAL '1 day'))`;
  }
  async overview(userId:string,formId:string,f:ResultsFilter):Promise<ResultsOverview>{
    const form=await requireForm(userId,formId);const db=getDb();
    const [versionRows,countRows,listRows,questionRows,choiceRows]=await Promise.all([
      this.versions(formId),
      db.execute(sql`SELECT count(*)::int AS total FROM fs_submissions s ${this.conditions(formId,f)}`),
      db.execute(sql`SELECT s.id,s.version_id,v.number,s.submitted_at FROM fs_submissions s ${this.conditions(formId,f)} ORDER BY s.submitted_at DESC, s.id DESC LIMIT ${f.limit} OFFSET ${f.offset}`),
      db.execute(sql`SELECT q.id,q.label,q.type,q.position,p.version_id,
          (SELECT count(*)::int FROM fs_answers a JOIN fs_submissions s ON s.id=a.submission_id ${this.conditions(formId,f)} AND a.question_id=q.id) AS responses,
          (SELECT COALESCE(jsonb_agg(jsonb_build_object('value',o.value,'label',o.label) ORDER BY o.position),'[]'::jsonb) FROM fs_question_options o WHERE o.question_id=q.id) AS options
        FROM fs_questions q JOIN fs_pages p ON p.id=q.page_id JOIN fs_versions v ON v.id=p.version_id
        WHERE v.form_id=${formId}::uuid AND v.status='published' AND (${f.versionId??null}::uuid IS NULL OR v.id=${f.versionId??null}::uuid)
        ORDER BY v.number DESC,p.position,q.position LIMIT 1500`),
      db.execute(sql`SELECT a.question_id, choice.value AS value, count(*)::int AS tally
        FROM fs_answers a JOIN fs_submissions s ON s.id=a.submission_id
        JOIN fs_questions q ON q.id=a.question_id
        CROSS JOIN LATERAL jsonb_array_elements_text(CASE
           WHEN q.type='multiple_choice' AND jsonb_typeof(a.value)='array' THEN a.value
           WHEN q.type IN ('single_choice','select') AND jsonb_typeof(a.value)='string' THEN jsonb_build_array(a.value)
           ELSE '[]'::jsonb END) choice(value)
        ${this.conditions(formId,f)}
        GROUP BY a.question_id,choice.value`),
    ]);
    const counts=new Map<string,Map<string,number>>();
    for(const r of choiceRows.rows){const id=String(r.question_id);if(!counts.has(id))counts.set(id,new Map());counts.get(id)!.set(String(r.value),Number(r.tally));}
    const questions:ResultsQuestion[]=questionRows.rows.map(r=>{
      const options=(r.options??[]) as {value:string;label:string}[];
      return {id:String(r.id),versionId:String(r.version_id),label:String(r.label),type:String(r.type),position:Number(r.position),options,
        responses:Number(r.responses),choices:options.map(o=>({...o,count:counts.get(String(r.id))?.get(o.value)??0}))};
    });
    const submissions:ResultsSubmission[]=listRows.rows.map(r=>({id:String(r.id),versionId:String(r.version_id),versionNumber:Number(r.number),submittedAt:iso(r.submitted_at)}));
    const total=Number(countRows.rows[0]?.total??0);
    return {formId,title:form.title,total,versions:versionRows,questions,submissions,offset:f.offset,limit:f.limit,hasMore:f.offset+submissions.length<total,completionRate:null};
  }
  async submission(userId:string,formId:string,submissionId:string):Promise<SubmissionDetail>{
    await requireForm(userId,formId);const db=getDb();
    const header=await db.execute(sql`SELECT s.id,s.version_id,s.submitted_at,v.number FROM fs_submissions s
      JOIN fs_versions v ON v.id=s.version_id WHERE s.id=${submissionId}::uuid AND v.form_id=${formId}::uuid AND s.status='submitted' AND s.deleted_at IS NULL LIMIT 1`);
    const r=header.rows[0];if(!r)throw missing();
    const rows=await db.execute(sql`SELECT a.id,a.question_id,a.value,q.label,q.type,q.position,p.position AS page_position,
      af.id AS audio_id,af.content_type,af.byte_size,af.duration_ms,af.transcript,af.transcript_source
      FROM fs_answers a JOIN fs_questions q ON q.id=a.question_id JOIN fs_pages p ON p.id=q.page_id
      LEFT JOIN fs_audio_files af ON af.answer_id=a.id AND af.status='uploaded' AND af.deleted_at IS NULL
      WHERE a.submission_id=${submissionId}::uuid ORDER BY p.position,q.position`);
    const answers:ResultAnswer[]=rows.rows.map(a=>({id:String(a.id),questionId:String(a.question_id),label:String(a.label),type:String(a.type),position:Number(a.position),
      value:a.audio_id?{kind:'audio'}:a.value,
      audio:a.audio_id?{id:String(a.audio_id),mimeType:String(a.content_type),durationMs:a.duration_ms==null?null:Number(a.duration_ms),bytes:Number(a.byte_size),transcript:a.transcript==null?null:String(a.transcript),transcriptSource:a.transcript_source==null?null:String(a.transcript_source)}:null}));
    return {id:String(r.id),versionId:String(r.version_id),versionNumber:Number(r.number),submittedAt:iso(r.submitted_at),answers};
  }
  async question(userId:string,formId:string,questionId:string,f:ResultsFilter){
    await requireForm(userId,formId);const db=getDb();
    const valid=await db.execute(sql`SELECT 1 FROM fs_questions q JOIN fs_pages p ON p.id=q.page_id JOIN fs_versions v ON v.id=p.version_id WHERE q.id=${questionId}::uuid AND v.form_id=${formId}::uuid LIMIT 1`);
    if(!valid.rows.length)throw missing();
    const count=await db.execute(sql`SELECT count(*)::int AS n FROM fs_answers a JOIN fs_submissions s ON s.id=a.submission_id ${this.conditions(formId,f)} AND a.question_id=${questionId}::uuid`);
    const rows=await db.execute(sql`SELECT s.id AS sid,s.submitted_at,a.id,a.question_id,a.value,q.label,q.type,q.position,
      af.id AS audio_id,af.content_type,af.byte_size,af.duration_ms,af.transcript,af.transcript_source
      FROM fs_answers a JOIN fs_submissions s ON s.id=a.submission_id
      JOIN fs_questions q ON q.id=a.question_id LEFT JOIN fs_audio_files af ON af.answer_id=a.id AND af.status='uploaded' AND af.deleted_at IS NULL
      ${this.conditions(formId,f)} AND a.question_id=${questionId}::uuid ORDER BY s.submitted_at DESC,s.id DESC LIMIT ${f.limit} OFFSET ${f.offset}`);
    return {total:Number(count.rows[0]?.n??0),answers:rows.rows.map(r=>({submissionId:String(r.sid),submittedAt:iso(r.submitted_at),answer:{id:String(r.id),questionId:String(r.question_id),label:String(r.label),type:String(r.type),position:Number(r.position),value:r.audio_id?{kind:'audio'}:r.value,
      audio:r.audio_id?{id:String(r.audio_id),mimeType:String(r.content_type),bytes:Number(r.byte_size),durationMs:r.duration_ms==null?null:Number(r.duration_ms),transcript:r.transcript==null?null:String(r.transcript),transcriptSource:r.transcript_source==null?null:String(r.transcript_source)}:null}}))};
  }
  private async forExport(userId:string,formId:string,f:ResultsFilter){
    // Two bounded queries, rather than issuing one DB request per respondent.
    await requireForm(userId,formId);
    const db=getDb();
    const rows=await db.execute(sql`SELECT s.id,s.version_id,s.submitted_at,v.number
      FROM fs_submissions s ${this.conditions(formId,f)} ORDER BY s.submitted_at ASC,s.id ASC LIMIT ${maximumExport+1}`);
    if(rows.rows.length>maximumExport)throw new ResultsFault(413,'EXPORT_TOO_LARGE',`Export limité à ${maximumExport} participations par sélection. Réduisez la période.`);
    const result:SubmissionDetail[]=rows.rows.map(r=>({id:String(r.id),versionId:String(r.version_id),versionNumber:Number(r.number),submittedAt:iso(r.submitted_at),answers:[]}));
    if(!result.length)return result;
    const ids=result.map(r=>r.id);
    const answers=await db.execute(sql`SELECT a.id,a.submission_id,a.question_id,a.value,q.label,q.type,q.position,
      af.id AS audio_id,af.content_type,af.byte_size,af.duration_ms,af.transcript,af.transcript_source
      FROM fs_answers a JOIN fs_questions q ON q.id=a.question_id
      JOIN fs_pages p ON p.id=q.page_id
      LEFT JOIN fs_audio_files af ON af.answer_id=a.id AND af.status='uploaded' AND af.deleted_at IS NULL
      WHERE a.submission_id IN (${sql.join(ids.map(id=>sql`${id}::uuid`),sql`, `)})
      ORDER BY p.position,q.position`);
    const byId=new Map(result.map(r=>[r.id,r]));
    for(const a of answers.rows){const row=byId.get(String(a.submission_id));if(!row)continue;
      row.answers.push({id:String(a.id),questionId:String(a.question_id),label:String(a.label),type:String(a.type),position:Number(a.position),
        value:a.audio_id?{kind:'audio'}:a.value,
        audio:a.audio_id?{id:String(a.audio_id),mimeType:String(a.content_type),durationMs:a.duration_ms==null?null:Number(a.duration_ms),bytes:Number(a.byte_size),transcript:a.transcript==null?null:String(a.transcript),transcriptSource:a.transcript_source==null?null:String(a.transcript_source)}:null});
    }
    return result;
  }
  async export(userId:string,formId:string,f:ResultsFilter,format:'csv'|'json'|'zip'){
    const rows=await this.forExport(userId,formId,f);
    const name=`formulaire-${formId.slice(0,8)}-${new Date().toISOString().slice(0,10)}`;
    if(format==='csv'||format==='json'){
      const content=format==='csv'?csvOfSubmissions(rows):exportJson(rows);
      if(Buffer.byteLength(content,'utf8')>maxZipBytes)throw new ResultsFault(413,'EXPORT_TOO_LARGE','Export supérieur à 16 Mo. Réduisez la période.');
      return {content,contentType:format==='csv'?'text/csv; charset=utf-8':'application/json; charset=utf-8',filename:`${name}.${format}`};
    }
    const files:Record<string,Uint8Array>={};let total=0;let count=0;
    const manifest:{submissionId:string;questionId:string;audioId:string;filename:string}[]=[];
    for(const row of rows)for(const a of row.answers)if(a.audio){
      if(++count>40)throw new ResultsFault(413,'ZIP_TOO_LARGE','Archive limitée à 40 enregistrements. Réduisez la période.');
      // Key is resolved server-side, never taken from the caller or included in the ZIP.
      const storageRow=await getDb().execute(sql`SELECT storage_key FROM fs_audio_files WHERE id=${a.audio.id}::uuid AND status='uploaded' AND deleted_at IS NULL`);
      const key=storageRow.rows[0]?.storage_key;
      if(typeof key!=='string')continue;
      const bytes=await this.storage.read(key);
      total+=bytes.byteLength;
      if(total>maxZipBytes)throw new ResultsFault(413,'ZIP_TOO_LARGE','Archive supérieure à 16 Mo. Réduisez la période.');
      const filename=`audio/${row.id}/${a.questionId}-${a.audio.id}.${suffix(a.audio.mimeType)}`;
      files[filename]=bytes;manifest.push({submissionId:row.id,questionId:a.questionId,audioId:a.audio.id,filename});
    }
    files['manifest.json']=strToU8(JSON.stringify({files:manifest},null,2));
    return {content:zipSync(files,{level:0}),contentType:'application/zip',filename:`${name}-audios.zip`};
  }
  async transcript(userId:string,formId:string,audioId:string,text:string,source:'whisper'|'noscribe'|'other'){
    await requireForm(userId,formId,true);const db=getDb();
    const updated=await db.execute(sql`UPDATE fs_audio_files a SET transcript=${text},transcript_source=${source},transcript_updated_at=now()
      FROM fs_answers ans JOIN fs_submissions s ON s.id=ans.submission_id JOIN fs_versions v ON v.id=s.version_id
      WHERE a.id=${audioId}::uuid AND a.answer_id=ans.id AND v.form_id=${formId}::uuid
        AND s.deleted_at IS NULL AND s.status='submitted' AND a.deleted_at IS NULL AND a.status='uploaded'
      RETURNING a.id`);
    if(!updated.rows.length)throw missing();return {id:audioId,updated:true};
  }
  async removeSubmission(userId:string,formId:string,submissionId:string){
    await requireForm(userId,formId,false,true);const db=getDb();
    const rows=await db.execute(sql`UPDATE fs_submissions s SET deleted_at=COALESCE(s.deleted_at,now())
      FROM fs_versions v WHERE s.id=${submissionId}::uuid AND s.version_id=v.id AND v.form_id=${formId}::uuid
      AND s.status='submitted' RETURNING s.id`);
    if(!rows.rows.length)throw missing();
    // Retry-safe: a failed R2 deletion remains soft-deleted and can be retried by the same owner.
    const files=await db.execute(sql`SELECT a.id,a.storage_key FROM fs_audio_files a JOIN fs_answers ans ON ans.id=a.answer_id
      WHERE ans.submission_id=${submissionId}::uuid AND a.status<>'removed'`);
    let pending=0;
    for(const file of files.rows){try{
      await this.storage.remove(String(file.storage_key));
      await db.execute(sql`UPDATE fs_audio_files SET status='removed',deleted_at=COALESCE(deleted_at,now()),transcript=NULL WHERE id=${String(file.id)}::uuid`);
    }catch(error){pending++;console.error('R2 removal pending',error instanceof Error?error.name:'unknown');}}
    return {deleted:true,pendingAudioCleanup:pending};
  }
}
