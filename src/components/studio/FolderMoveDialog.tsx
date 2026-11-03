import { useEffect, useRef } from 'react';
import { FileInput, Folder, FolderOpen, X } from 'lucide-react';
import type { FolderInfo } from './FolderSidebar';
type Props={
 formTitle:string;
 folders:FolderInfo[];
 current:string|null;
 busy:boolean;
 mode?:'form'|'folder';
 blockedIds?:string[];
 onMove:(folderId:string|null)=>void;
 onClose:()=>void;
};
function orderFolders(folders:FolderInfo[]){
 const ordered:Array<{folder:FolderInfo;depth:number}>=[],seen=new Set<string>();
 const visit=(parentId:string|null,depth:number)=>{
  for(const f of folders.filter(x=>(x.parentId??null)===parentId).sort((a,b)=>a.name.localeCompare(b.name,'fr'))){
   if(seen.has(f.id))continue;seen.add(f.id);ordered.push({folder:f,depth});visit(f.id,depth+1);
  }
 };
 visit(null,0);return ordered;
}
export function FolderMoveDialog({formTitle,folders,current,busy,mode='form',blockedIds=[],onMove,onClose}:Props){
 const firstRef=useRef<HTMLButtonElement>(null);
 const dialogRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const oldFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  firstRef.current?.focus();
  return()=>oldFocus?.focus();
 },[]);
 const row=(id:string|null,label:string,depth=0)=>(
  <button type="button" key={id??'root'} disabled={busy||Boolean(id&&blockedIds.includes(id))} onClick={()=>onMove(id)}
   style={{paddingLeft:12+depth*18}}
   className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition hover:bg-[#edf5ec] disabled:opacity-60 ${current===id?'bg-[#e8f3e6] font-semibold text-[#2c6e42]':'text-[#40614a]'}`}>
   {id?<Folder size={18}/>:<FileInput size={18}/>}
   <span className="min-w-0 flex-1 truncate">{label}</span>
   {current===id&&<span className="text-xs text-[#38784b]">Actuel</span>}
  </button>
 );
 return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#173322]/35 p-4"
  onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}>
  <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="folder-move-title"
   onKeyDown={event=>{
    if(event.key==='Escape'&&!busy){event.preventDefault();onClose();}
    if(event.key!=='Tab')return;
    const nodes=Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])')??[]);
    const first=nodes[0],last=nodes[nodes.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
   }}
   className="w-full max-w-md rounded-2xl border border-[#dce8da] bg-white p-5 shadow-2xl sm:p-6">
   <div className="flex items-start justify-between gap-3">
    <div><h2 id="folder-move-title" className="text-xl font-bold text-[#294836]">Déplacer {mode==='form'?'le formulaire':'le dossier'}</h2>
    <p className="mt-1 truncate text-sm text-[#667e6b]" title={formTitle}>{formTitle}</p></div>
    <button ref={firstRef} type="button" aria-label="Fermer" disabled={busy} onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-lg text-[#4f6f58] hover:bg-[#f0f5ee]"><X size={19}/></button>
   </div>
   <div className="mt-5 max-h-[55vh] space-y-1 overflow-y-auto">
    {row(null,mode==='form'?'Sans dossier':'Racine des dossiers')}
    {folders.length>0&&<div className="mx-2 my-2 border-t border-[#e4ece1]"/>}
    {orderFolders(folders).map(({folder,depth})=>row(folder.id,folder.name,depth))}
   </div>
   <p className="mt-4 flex items-center gap-2 border-t border-[#e5eee3] pt-3 text-xs text-[#647c68]"><FolderOpen size={15}/> Sélectionne un emplacement pour déplacer {mode==='form'?'le formulaire':'le dossier'}.</p>
  </div>
 </div>;
}
