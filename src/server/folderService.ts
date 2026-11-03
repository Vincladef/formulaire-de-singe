import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from './db/client';
import { forms, folders } from './db/schema';

export const folderNameSchema=z.object({name:z.string().trim().min(1).max(80)}).strict();
export const moveToFolderSchema=z.object({folderId:z.string().uuid().nullable()}).strict();
export const folderCreateSchema=folderNameSchema.extend({parentId:z.string().uuid().nullable().optional()}).strict();
export const folderParentSchema=z.object({parentId:z.string().uuid().nullable()}).strict();
const folderParams=z.object({id:z.string().uuid()}).strict();
export class FolderValidationError extends Error {code='VALIDATION_ERROR' as const;status=400;}
export class FolderNotFoundError extends Error {code='NOT_FOUND' as const;status=404;}
function parsed<T>(schema:z.ZodSchema<T>, input:unknown):T{
 const result=schema.safeParse(input);
 if(!result.success)throw new FolderValidationError('Nom ou identifiant de dossier incorrect.');
 return result.data;
}
const serialize=(f:{id:string;name:string;parentId:string|null;createdAt:Date})=>({id:f.id,name:f.name,parentId:f.parentId,createdAt:f.createdAt.toISOString()});
type TreeFolder={id:string;parentId:string|null};
function folderChain(list:TreeFolder[],id:string):string[]|null{
 const map=new Map(list.map(f=>[f.id,f])),chain:string[]=[],visited=new Set<string>();
 let current:string|null=id;
 while(current){
  if(visited.has(current))return null;
  visited.add(current);
  const node=map.get(current);
  if(!node)return null;
  chain.push(current);
  current=node.parentId;
 }
 return chain;
}
function folderSubtreeHeight(list:TreeFolder[],id:string,seen=new Set<string>()):number{
 if(seen.has(id))throw new FolderValidationError('Hiérarchie des dossiers invalide.');
 seen.add(id);
 const children=list.filter(f=>f.parentId===id);
 const height=1+Math.max(0,...children.map(child=>folderSubtreeHeight(list,child.id,new Set(seen))));
 return height;
}

/** Folder operations are owner-only; invited editors never access private organisation. */
export const folderActions={
 async list(userId:string){
  const rows=await getDb().select({id:folders.id,name:folders.name,parentId:folders.parentId,createdAt:folders.createdAt})
   .from(folders).where(eq(folders.ownerId,userId)).orderBy(asc(folders.name),asc(folders.id));
  return rows.map(serialize);
 },
 async create(userId:string,input:unknown){
  const {name,parentId}=parsed(folderCreateSchema,input);
  if(parentId){
   const list=await folderActions.list(userId);
   const chain=folderChain(list,parentId);
   if(!chain)throw new FolderNotFoundError('Dossier parent introuvable.');
   if(chain.length>=3)throw new FolderValidationError('Trois niveaux de dossiers au maximum.');
  }
  const [row]=await getDb().insert(folders).values({ownerId:userId,name,parentId:parentId??null})
   .returning({id:folders.id,name:folders.name,parentId:folders.parentId,createdAt:folders.createdAt});
  return serialize(row);
 },
 async rename(userId:string,id:unknown,input:unknown){
  const {id:folderId}=parsed(folderParams,{id});
  const {name}=parsed(folderNameSchema,input);
  const [row]=await getDb().update(folders).set({name,updatedAt:sql`now()`})
    .where(and(eq(folders.id,folderId),eq(folders.ownerId,userId)))
    .returning({id:folders.id,name:folders.name,parentId:folders.parentId,createdAt:folders.createdAt});
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
 async moveFolder(userId:string,id:unknown,input:unknown){
  const {id:folderId}=parsed(folderParams,{id});
  const {parentId}=parsed(folderParentSchema,input);
  const list=await folderActions.list(userId);
  if(!list.some(folder=>folder.id===folderId))throw new FolderNotFoundError('Dossier introuvable.');
  const chain=parentId?folderChain(list,parentId):[];
  if(chain===null)throw new FolderNotFoundError('Dossier parent introuvable.');
  if(chain.includes(folderId))throw new FolderValidationError('Impossible de déplacer un dossier dans lui-même ou dans un sous-dossier.');
  const maxDepth=folderSubtreeHeight(list,folderId);
  if(chain.length+maxDepth>3)throw new FolderValidationError('Trois niveaux de dossiers au maximum.');
  const [row]=await getDb().update(folders).set({parentId,updatedAt:sql`now()`})
   .where(and(eq(folders.id,folderId),eq(folders.ownerId,userId),
    parentId?sql`EXISTS (SELECT 1 FROM fs_form_folders fp WHERE fp.id=${parentId}::uuid AND fp.owner_id=${userId})`:sql`true`))
   .returning({id:folders.id,parentId:folders.parentId});
  if(!row)throw new FolderNotFoundError('Dossier introuvable.');
  return row;
 },
};
export type FolderSummary=Awaited<ReturnType<typeof folderActions.list>>[number];
