import { Archive, Copy, Ellipsis, Trash2, Undo2 } from 'lucide-react';
import type { MouseEvent } from 'react';

export function FormItemMenu({title,archived,onDuplicate,onArchive,onDelete}:{
 title:string;archived:boolean;onDuplicate:()=>void;onArchive:()=>void;onDelete:()=>void;
}){
 const dismiss=(e:MouseEvent<HTMLButtonElement>,callback:()=>void)=>{
  e.currentTarget.closest('details')?.removeAttribute('open');callback();
 };
 return <details className="group relative shrink-0" onKeyDown={e=>{if(e.key==='Escape'){e.currentTarget.removeAttribute('open');(e.currentTarget.querySelector('summary') as HTMLElement|null)?.focus();}}}>
  <summary aria-label={`Actions pour ${title}`} title="Autres actions" className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-xl text-[#536d5b] hover:bg-[#e9f2e8] focus-visible:outline-2 focus-visible:outline-[#33754d] [&::-webkit-details-marker]:hidden"><Ellipsis size={20}/></summary>
  <div className="absolute right-0 top-12 z-40 w-52 rounded-xl border border-[#dce8dc] bg-white p-1.5 shadow-xl">
   <button type="button" onClick={e=>dismiss(e,onDuplicate)} className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-[#385b44] hover:bg-[#eef5ed]"><Copy size={16}/>Dupliquer</button>
   <button type="button" onClick={e=>dismiss(e,onArchive)} className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-[#385b44] hover:bg-[#eef5ed]">{archived?<Undo2 size={16}/>:<Archive size={16}/>} {archived?'Restaurer':'Archiver'}</button>
   <div className="my-1 border-t border-[#e8eee6]"/>
   <button type="button" onClick={e=>dismiss(e,onDelete)} className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-[#98433e] hover:bg-red-50"><Trash2 size={16}/>Mettre à la corbeille</button>
  </div>
 </details>;
}
