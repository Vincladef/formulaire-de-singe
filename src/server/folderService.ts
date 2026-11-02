import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from './db/client';
import { forms, folders } from './db/schema';

export const folderNameSchema=z.object({name:z.string().trim().min(1).max(80)}).strict();
export const moveToFolderSchema=z.object({folderId:z.string().uuid().nullable()}).strict();
const folderParams=z.object({id:z.string().uuid()}).strict();
export class FolderValidationError extends Error {code='VALIDATION_ERROR' as const;status=400;}
export class FolderNotFoundError extends Error {code='NOT_FOUND' as const;status=404;}
function parsed<T>(schema:z.ZodSchema<T>, input:unknown):T{
 const result=schema.safeParse(input);
 if(!result.success)throw new FolderValidationError('Nom ou identifiant de dossier incorrect.');
 return result.data;
}
const serialize=(f:{id:string;name:string;createdAt:Date})=>({id:f.id,name:f.name,createdAt:f.createdAt.toISOString()});
/** Folder operations are owner-only; invited editors never access private organisation. */
export const folderActions={
 async list(userId:string){
  const rows=await getDb().select({id:folders.id,name:folders.name,createdAt:folders.createdAt})
   .from(folders).where(eq(folders.ownerId,userId)).orderBy(asc(folders.name),asc(folders.id));
  return rows.map(serialize);
 },
 async create(userId:string,input:unknown){
  const {name}=parsed(folderNameSchema,input);
  const [row]=await getDb().insert(folders).values({ownerId:userId,name})
   .returning({id:folders.id,name:folders.name,createdAt:folders.createdAt});
  return serialize(row);
 },
 async rename(userId:string,id:unknown,input:unknown){
  const {id:folderId}=parsed(folderParams,{id});
  const {name}=parsed(folderNameSchema,input);
  const [row]=await getDb().update(folders).set({name,updatedAt:sql`now()`})
    .where(and(eq(folders.id,folderId),eq(folders.ownerId,userId)))
    .returning({id:folders.id,name:folders.name,createdAt:folders.createdAt});
  if(!row)throw new FolderNotFoundError('Dossier introuvable.');
  return serialize(row);
 },
 async delete(userId:string,id:unknown){
  const {id:folderId}=parsed(folderParams,{id});
  // ON DELETE SET NULL keeps every form, submission and public link intact.
  const [row]=await getDb().delete(folders)
   .where(and(eq(folders.id,folderId),eq(folders.ownerId,userId)))
   .returning({id:folders.id});
  if(!row)throw new FolderNotFoundError('Dossier introuvable.');
  return {id:row.id};
 },
 async move(userId:string,id:unknown,input:unknown){
  const {id:formId}=parsed(folderParams,{id});
  const {folderId}=parsed(moveToFolderSchema,input);
  const db=getDb();
  // An atomic guarded update also rejects a folder belonging to someone else.
  const [row]=await db.update(forms).set({folderId,updatedAt:sql`now()`}).where(and(
   eq(forms.id,formId),eq(forms.ownerId,userId),isNull(forms.deletedAt),
   folderId===null?sql`true`:sql`EXISTS (
     SELECT 1 FROM fs_form_folders f WHERE f.id = ${folderId}::uuid AND f.owner_id = ${userId}
   )`
  )).returning({id:forms.id,folderId:forms.folderId});
  if(!row)throw new FolderNotFoundError('Formulaire ou dossier introuvable, ou accès non autorisé.');
  return row;
 },
};
export type FolderSummary=Awaited<ReturnType<typeof folderActions.list>>[number];
