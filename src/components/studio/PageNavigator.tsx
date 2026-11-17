import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import type { StudioPageData } from '../../shared/studio';

type Props={
 pages:StudioPageData[];
 pageIndex:number;
 onSelect:(index:number)=>void;
 onRename:(index:number,title:string)=>void;
 onAdd:()=>void;
 editable:boolean;
};

/** Pages are navigation tabs; their names are independent from headings in the document. */
export function PageNavigator({pages,pageIndex,onSelect,onRename,onAdd,editable}:Props){
 const [editing,setEditing]=useState<string|null>(null);
 const [name,setName]=useState('');
 const startRename=(id:string,title:string)=>{setEditing(id);setName(title==='Nouvelle page'?'':title);};
 const saveRename=(index:number)=>{
  if(editing!==pages[index]?.id)return;
  onRename(index,name.trim().slice(0,200)||`Page ${index+1}`);
  setEditing(null);
 };
 return <nav aria-label="Navigation des pages" className="flex items-center gap-2 rounded-2xl border border-[#e0e9dd] bg-white px-3 py-2.5 sm:px-4">
  <span className="hidden shrink-0 text-xs font-semibold uppercase tracking-wide text-[#708875] sm:inline">Pages</span>
  <div role="tablist" aria-label="Pages du formulaire" className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
   {pages.map((page,index)=>{
    const title=page.title.trim()&&page.title!=='Nouvelle page'?page.title.trim():null;
    return <div key={page.id} className={`flex min-h-11 max-w-[260px] shrink-0 items-center rounded-xl ${pageIndex===index?'bg-[#e3f0e0] text-[#2c6842] ring-1 ring-[#cde2c7]':'text-[#55725d] hover:bg-[#f1f7ef]'}`}>
     {editing===page.id
      ?<input autoFocus aria-label={`Nom de la page ${index+1}`} value={name} maxLength={200}
       onChange={event=>setName(event.target.value)}
       onBlur={()=>saveRename(index)}
       onKeyDown={event=>{
        if(event.key==='Enter'){event.preventDefault();saveRename(index);}
        if(event.key==='Escape')setEditing(null);
       }}
       className="h-11 w-[195px] rounded-xl border border-[#94b79c] bg-white px-3 text-sm outline-none"/>
      :<>
       <button type="button" role="tab" id={`page-tab-${page.id}`}
        aria-controls="monk-page-editor" aria-selected={pageIndex===index} tabIndex={0}
        onClick={()=>onSelect(index)} onDoubleClick={()=>{if(editable)startRename(page.id,page.title);}}
        className={`flex min-h-11 min-w-0 items-center gap-2 rounded-xl py-2 pl-3 text-left text-sm ${editable?'pr-1':'pr-3'} ${pageIndex===index?'font-semibold':''}`}>
        <span className="shrink-0 text-xs opacity-70">Page {index+1}</span>
        {title&&<span className="truncate">{title}</span>}
       </button>
       {editable&&<button type="button" aria-label={`Renommer la page ${index+1}`}
        onClick={()=>startRename(page.id,page.title)} title="Renommer cet onglet (sans modifier le texte du document)"
        className="mr-1 flex h-9 w-8 shrink-0 items-center justify-center rounded-lg text-[#66836d] hover:bg-white/70">
        <Pencil size={14}/>
       </button>}
      </>}
    </div>;
   })}
  </div>
  {editable&&<button type="button" onClick={onAdd} aria-label="Ajouter une page"
   className="inline-flex h-11 shrink-0 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-[#326b46] hover:bg-[#edf6e9]">
   <Plus size={16}/><span className="hidden sm:inline">Ajouter</span>
  </button>}
 </nav>;
}
