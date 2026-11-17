import { Plus } from 'lucide-react';
import type { StudioPageData } from '../../shared/studio';

type Props={
 pages:StudioPageData[];
 pageIndex:number;
 onSelect:(index:number)=>void;
 onAdd:()=>void;
 editable:boolean;
};

/** The primary page navigation belongs to the document, not to the tool drawer. */
export function PageNavigator({pages,pageIndex,onSelect,onAdd,editable}:Props){
 return <nav aria-label="Navigation des pages" className="flex items-center gap-2 rounded-2xl border border-[#e0e9dd] bg-white px-3 py-2.5 sm:px-4">
  <span className="hidden shrink-0 text-xs font-semibold uppercase tracking-wide text-[#708875] sm:inline">Pages</span>
  <div role="tablist" aria-label="Pages du formulaire" className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
   {pages.map((page,index)=>{
    const title=page.title.trim()&&page.title!=='Nouvelle page'?page.title.trim():null;
    return <button type="button" role="tab" key={page.id} id={`page-tab-${page.id}`}
     aria-controls="monk-page-editor" aria-selected={pageIndex===index} tabIndex={0}
     onClick={()=>onSelect(index)}
     className={`flex min-h-11 max-w-[230px] shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${pageIndex===index?'bg-[#e3f0e0] font-semibold text-[#2c6842] ring-1 ring-[#cde2c7]':'text-[#55725d] hover:bg-[#f1f7ef]'}`}>
     <span className="shrink-0 text-xs opacity-70">Page {index+1}</span>
     {title&&<span className="truncate">{title}</span>}
    </button>;
   })}
  </div>
  {editable&&<button type="button" onClick={onAdd} aria-label="Ajouter une page"
   className="inline-flex h-11 shrink-0 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-[#326b46] hover:bg-[#edf6e9]">
   <Plus size={16}/><span className="hidden sm:inline">Ajouter</span>
  </button>}
 </nav>;
}
