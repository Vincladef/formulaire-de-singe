import type { Config } from '@netlify/functions';
import { and,eq,lt,or,sql } from 'drizzle-orm';
import { getDb } from '../../src/server/db/client';
import { audioUploads } from '../../src/server/db/schema';
import { R2AudioStorage } from '../../src/server/audioStorage';
export default async()=>{
 const db=getDb(),storage=new R2AudioStorage();
 const old=await db.select().from(audioUploads)
  .where(and(lt(audioUploads.expiresAt,new Date()),or(eq(audioUploads.status,'issued'),eq(audioUploads.status,'verified')))).limit(40);
 let removed=0;
 for(const item of old){
  try{await storage.remove(item.storageKey);
   await db.update(audioUploads).set({status:'expired'}).where(and(eq(audioUploads.id,item.id),or(eq(audioUploads.status,'issued'),eq(audioUploads.status,'verified'))));
   removed++;
  }catch(e){console.error('Audio cleanup failed',item.id,e instanceof Error?e.name:'unknown');}
 }
 // Complete R2 deletion for soft-deleted submissions, even if the original request failed mid-way.
 const pending=await db.execute(sql`SELECT af.id,af.storage_key FROM fs_audio_files af
   JOIN fs_answers a ON a.id=af.answer_id JOIN fs_submissions s ON s.id=a.submission_id
   WHERE s.deleted_at IS NOT NULL AND af.status<>'removed' LIMIT 40`);
 let deleted=0;
 for(const file of pending.rows){
  try{
   await storage.remove(String(file.storage_key));
   await db.execute(sql`UPDATE fs_audio_files SET status='removed',deleted_at=COALESCE(deleted_at,now()),transcript=NULL WHERE id=${String(file.id)}::uuid`);
   deleted++;
  }catch(e){console.error('Deleted audio cleanup failed',e instanceof Error?e.name:'unknown');}
 }
 return Response.json({removedAbandoned:removed,removedDeleted:deleted});
};
export const config:Config={schedule:'31 3 * * *'};
