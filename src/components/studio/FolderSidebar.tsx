import { Folder, FolderOpen, FolderPlus, MoreHorizontal, Pencil, Trash2, Layers3 } from 'lucide-react';
import type { ReactNode } from 'react';
export type FolderInfo={id:string;name:string;createdAt:string};
type Props={
 folders:FolderInfo[];
 selected:string;
 formCounts:Record<string,number>;
 allCount:number;
 onSelect:(id:string)=>void;
 onCreate:()=>void;
 onRename:(folder:FolderInfo)=>void;
 onDelete:(folder:FolderInfo)=>void;
};
export function FolderSidebar({folders,selected,formCounts,allCount,onSelect,onCreate,onRename,onDelete}:Props){
 const tab=(id:string,label:string,count:number,icon:ReactNode)=>(
  <button type="button" aria-pressed={selected===id} onClick={()=>onSelect(id)}
   className={`flex min-h-11 w-full min-w-0 items-center gap-2 rounded-xl px-3 text-left text-sm transition ${selected===id?'bg-[#e6f2e4] font-semibold text-[#2b7145]':'text-[#46624d] hover:bg-[#f1f6ef]'}`}>
   {icon}<span className="min-w-0 flex-1 truncate">{label}</span>
   <span className="shrink-0 text-xs tabular-nums text-[#617866]">{count}</span>
  </button>
 );
 return <aside aria-label="Dossiers de formulaires" className="w-full self-start rounded-2xl border border-[#e1e9de] bg-white px-3 py-3 lg:sticky lg:top-4">
  <div className="flex items-center justify-between gap-2 px-2 py-1">
   <h2 className="text-xs font-bold uppercase tracking-[.10em] text-[#59705f]">Bibliothèque</h2>
   <button type="button" aria-label="Nouveau dossier" title="Nouveau dossier" onClick={onCreate}
    className="flex h-10 w-10 items-center justify-center rounded-xl text-[#3d7051] hover:bg-[#eaf3e8] focus-visible:outline-2 focus-visible:outline-[#36774e]">
    <FolderPlus size={19}/>
   </button>
  </div>
  <div className="space-y-0.5">
   {tab('all','Tous les formulaires',allCount,<Layers3 size={18} className="shrink-0"/>)}
   {tab('uncategorized','Sans dossier',formCounts.uncategorized??0,<Folder size={18} className="shrink-0"/>)}
  </div>
  <div className="mx-2 my-3 border-t border-[#e7eee5]"/>
  <div className="mb-1 flex items-center justify-between gap-2 px-2">
   <h3 className="text-xs font-bold uppercase tracking-[.10em] text-[#607265]">Mes dossiers</h3>
   <span className="text-xs tabular-nums text-[#78907b]">{folders.length}</span>
  </div>
  {folders.length===0?<p className="px-3 py-4 text-xs leading-6 text-[#647768]">Crée un dossier pour ranger tes formulaires.</p>:<div className="max-h-80 space-y-0.5 overflow-y-auto">
   {folders.map(folder=><div key={folder.id} className="group flex items-center gap-0.5">
    <div className="min-w-0 flex-1">
     {tab(folder.id,folder.name,formCounts[folder.id]??0,selected===folder.id?<FolderOpen size={18} className="shrink-0"/>:<Folder size={18} className="shrink-0"/>)}
    </div>
    <details className="relative shrink-0" onKeyDown={e=>{if(e.key==='Escape'){e.currentTarget.removeAttribute('open');(e.currentTarget.querySelector('summary') as HTMLElement|null)?.focus();}}}>
     <summary aria-label={`Options du dossier ${folder.name}`} title="Options du dossier"
      className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg text-[#526b58] opacity-60 hover:bg-[#edf4ea] hover:opacity-100 focus-visible:opacity-100 [&::-webkit-details-marker]:hidden">
      <MoreHorizontal size={17}/>
     </summary>
     <div className="absolute right-0 top-10 z-40 w-44 rounded-xl border border-[#dce6d9] bg-white p-1.5 shadow-xl">
      <button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-[#45684f] hover:bg-[#edf4ea]" onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');onRename(folder);}}><Pencil size={15}/> Renommer</button>
      <button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-[#a05248] hover:bg-red-50" onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');onDelete(folder);}}><Trash2 size={15}/> Supprimer</button>
     </div>
    </details>
   </div>)}
  </div>}
 </aside>;
}
