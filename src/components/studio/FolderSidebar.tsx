import {useEffect,useMemo,useState} from 'react';
import {ChevronDown,ChevronRight,Clock3,Folder,FolderOpen,FolderPlus,MoreHorizontal,Pencil,Trash2,Layers3,FolderInput,Plus} from 'lucide-react';
import type {DragEvent,ReactNode} from 'react';

export type FolderInfo={id:string;name:string;createdAt:string;parentId?:string|null};
type Props={
 folders:FolderInfo[];selected:string;formCounts:Record<string,number>;allCount:number;
 onSelect:(id:string)=>void;onCreate:()=>void;onRename:(folder:FolderInfo)=>void;onDelete:(folder:FolderInfo)=>void;
 onCreateChild?:(id:string)=>void;onMoveFolder?:(id:string,parentId:string|null)=>void;
 onMoveForm?:(id:string,folderId:string|null)=>void;
};
export function FolderSidebar({folders,selected,formCounts,allCount,onSelect,onCreate,onRename,onDelete,onCreateChild,onMoveFolder,onMoveForm}:Props){
 const [expanded,setExpanded]=useState<string[]>([]);
 const [hoverTarget,setHoverTarget]=useState<string|null>(null);
 const map=useMemo(()=>new Map(folders.map(f=>[f.id,f])),[folders]);
 useEffect(()=>{
  if(!map.has(selected))return;
  const ids:string[]=[];let f=map.get(selected);const seen=new Set<string>();
  while(f?.parentId&&!seen.has(f.parentId)){seen.add(f.parentId);ids.push(f.parentId);f=map.get(f.parentId);}
  if(ids.length)setExpanded(prev=>Array.from(new Set([...prev,...ids])));
 },[selected,map]);
 function drop(event:DragEvent,folderId:string|null){
  event.preventDefault();event.stopPropagation();setHoverTarget(null);
  const form=event.dataTransfer.getData('application/x-monk-form');
  const folder=event.dataTransfer.getData('application/x-monk-folder');
  if(form&&onMoveForm)onMoveForm(form,folderId);
  else if(folder&&folder!==folderId&&onMoveFolder)onMoveFolder(folder,folderId);
 }
 function dropHandlers(id:string|null){
  return {
   onDragOver:(event:DragEvent)=>{if(!onMoveForm&&!onMoveFolder)return;event.preventDefault();event.dataTransfer.dropEffect='move';setHoverTarget(id??'uncategorized');},
   onDragLeave:(event:DragEvent)=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setHoverTarget(null);},
   onDrop:(event:DragEvent)=>drop(event,id)
  };
 }
 const tab=(id:string,label:string,count:number,icon:ReactNode)=><button type="button" aria-pressed={selected===id} onClick={()=>onSelect(id)}
  className={`flex min-h-10 w-full min-w-0 items-center gap-2 rounded-lg px-3 text-left text-sm transition ${selected===id?'bg-[#e6f2e4] font-semibold text-[#2b7145]':'text-[#46624d] hover:bg-[#f1f6ef]'}`}>
  {icon}<span className="min-w-0 flex-1 truncate">{label}</span>
  <span className="shrink-0 text-xs tabular-nums text-[#617866]">{count}</span>
 </button>;
 function childrenOf(parentId:string|null){return folders.filter(f=>(f.parentId??null)===parentId).sort((a,b)=>a.name.localeCompare(b.name,'fr'));}
 function folderRow(folder:FolderInfo,depth:number):ReactNode{
  const children=childrenOf(folder.id);const open=expanded.includes(folder.id);
  return <div key={folder.id}>
   <div className={`group flex items-center gap-0.5 rounded-xl ${hoverTarget===folder.id?'bg-[#d5ead4] ring-2 ring-[#4d9a64]':''}`}
    {...dropHandlers(folder.id)} draggable={!!onMoveFolder}
    onDragStart={e=>{e.stopPropagation();e.dataTransfer.setData('application/x-monk-folder',folder.id);e.dataTransfer.effectAllowed='move';}}>
    <div style={{paddingLeft:Math.min(depth,2)*13}} className="flex min-w-0 flex-1 items-center">
     <button type="button" onClick={()=>setExpanded(v=>v.includes(folder.id)?v.filter(x=>x!==folder.id):[...v,folder.id])}
      aria-label={(open?'Replier ':'Déplier ')+folder.name} disabled={!children.length} className="flex h-8 w-6 shrink-0 items-center justify-center text-[#6b8370] disabled:opacity-25">
      {open?<ChevronDown size={15}/>:<ChevronRight size={15}/>}
     </button>
     <div className="min-w-0 flex-1">
      {tab(folder.id,folder.name,formCounts[folder.id]??0,selected===folder.id?<FolderOpen size={17} className="shrink-0"/>:<Folder size={17} className="shrink-0"/>)}
     </div>
    </div>
    <details className="relative shrink-0" onKeyDown={e=>{if(e.key==='Escape'){e.currentTarget.removeAttribute('open');(e.currentTarget.querySelector('summary') as HTMLElement|null)?.focus();}}}>
     <summary aria-label={`Options du dossier ${folder.name}`} title="Options du dossier"
      className="flex h-9 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-[#526b58] opacity-60 hover:bg-[#edf4ea] hover:opacity-100 focus-visible:opacity-100 [&::-webkit-details-marker]:hidden">
      <MoreHorizontal size={17}/>
     </summary>
     <div className="absolute right-0 top-10 z-50 w-52 rounded-xl border border-[#dce6d9] bg-white p-1.5 shadow-xl">
      {depth<2&&onCreateChild&&<button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-[#edf4ea]" onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');onCreateChild(folder.id);}}><Plus size={15}/> Sous-dossier</button>}
      {onMoveFolder&&<button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-[#edf4ea]" onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');onMoveFolder(folder.id,null);}}><FolderInput size={15}/> Déplacer à la racine</button>}
      <button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-[#45684f] hover:bg-[#edf4ea]" onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');onRename(folder);}}><Pencil size={15}/> Renommer</button>
      <button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-[#a05248] hover:bg-red-50" onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');onDelete(folder);}}><Trash2 size={15}/> Supprimer</button>
     </div>
    </details>
   </div>
   {open&&children.map(child=>folderRow(child,depth+1))}
  </div>;
 }
 const roots=childrenOf(null);
 return <aside aria-label="Dossiers de formulaires" className="w-full self-start rounded-2xl border border-[#e1e9de] bg-white px-3 py-3 lg:sticky lg:top-4">
  <div className="flex items-center justify-between gap-2 px-2 py-1">
   <h2 className="text-xs font-bold uppercase tracking-[.10em] text-[#59705f]">Bibliothèque</h2>
   <button type="button" aria-label="Nouveau dossier" title="Nouveau dossier" onClick={onCreate}
    className="flex h-10 w-10 items-center justify-center rounded-xl text-[#3d7051] hover:bg-[#eaf3e8] focus-visible:outline-2 focus-visible:outline-[#36774e]"><FolderPlus size={19}/></button>
  </div>
  <div className="space-y-0.5">
   {tab('all','Tous les formulaires',allCount,<Layers3 size={18} className="shrink-0"/>)}
   {tab('recent','Récents',allCount,<Clock3 size={18} className="shrink-0"/>)}
   <div className={hoverTarget==='uncategorized'?'rounded-xl bg-[#d5ead4] ring-2 ring-[#4d9a64]':''} {...dropHandlers(null)}>
    {tab('uncategorized','Sans dossier',formCounts.uncategorized??0,<Folder size={18} className="shrink-0"/>)}
   </div>
  </div>
  <div className="mx-2 my-3 border-t border-[#e7eee5]"/>
  <div className="mb-1 flex items-center justify-between gap-2 px-2">
   <h3 className="text-xs font-bold uppercase tracking-[.10em] text-[#607265]">Dossiers</h3>
   <span className="text-xs tabular-nums text-[#78907b]">{folders.length}</span>
  </div>
  {folders.length===0?<p className="px-3 py-4 text-xs leading-6 text-[#647768]">Crée un dossier pour ranger tes formulaires.</p>:
   <div className="max-h-[55vh] space-y-0.5 overflow-y-auto">{roots.map(f=>folderRow(f,0))}</div>}
  <p className="mt-3 border-t border-[#eef1ec] px-2 pt-3 text-[11px] leading-5 text-[#819184]">Glisse un formulaire ou un dossier pour le ranger.</p>
 </aside>;
}
