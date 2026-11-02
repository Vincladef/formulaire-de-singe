import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';

export type StudioDialogIntent = {
 kind:'confirm'|'text'; title:string; description?:string; initialValue?:string;
 confirmLabel?:string; danger?:boolean;
};
type Props={intent:StudioDialogIntent;onResolve:(result:string|null)=>void};

/** One consistent keyboard-accessible dialog instead of native browser prompts. */
export function StudioDialog({intent,onResolve}:Props){
 const [value,setValue]=useState(intent.initialValue??'');
 const dialogRef=useRef<HTMLDivElement>(null);
 const inputRef=useRef<HTMLInputElement>(null);
 const cancelRef=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  (intent.kind==='text'?inputRef.current:cancelRef.current)?.focus();
  return()=>previous?.focus();
 },[intent.kind]);
 function onKeyDown(e:KeyboardEvent<HTMLDivElement>){
  if(e.key==='Escape'){e.preventDefault();onResolve(null);}
  if(e.key!=='Tab')return;
  const nodes=[...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled])')??[])];
  if(!nodes.length)return;
  const first=nodes[0],last=nodes[nodes.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 }
 return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1b3324]/35 p-4" onMouseDown={e=>{if(e.target===e.currentTarget)onResolve(null);}}>
  <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="studio-dialog-title"
   aria-describedby={intent.description?'studio-dialog-description':undefined} onKeyDown={onKeyDown}
   className="w-full max-w-md rounded-2xl border border-[#dce8da] bg-white p-6 shadow-2xl sm:p-7">
   <div className="flex items-start justify-between gap-4">
    <h2 id="studio-dialog-title" className="text-xl font-bold tracking-tight text-[#294836]">{intent.title}</h2>
    <button type="button" aria-label="Fermer" onClick={()=>onResolve(null)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#536f5d] hover:bg-[#edf4ec]"><X size={19}/></button>
   </div>
   {intent.description&&<p id="studio-dialog-description" className="mt-3 text-sm leading-6 text-[#607265]">{intent.description}</p>}
   <form onSubmit={e=>{e.preventDefault();onResolve(intent.kind==='text'?value.trim()||null:'yes');}}>
    {intent.kind==='text'&&<label className="mt-5 block space-y-2 text-sm font-semibold text-[#385943]">Nom
      <input ref={inputRef} aria-label="Nom" autoComplete="off" value={value} maxLength={200} onChange={e=>setValue(e.target.value)}
       className="block h-12 w-full rounded-xl border border-[#becfbc] bg-white px-3 text-base text-[#294836] outline-none focus:border-[#36794f] focus:ring-2 focus:ring-[#daebdc]"/>
     </label>}
    <div className="mt-6 flex justify-end gap-2">
     <button ref={cancelRef} type="button" onClick={()=>onResolve(null)} className="min-h-11 rounded-xl border border-[#d9e5d8] bg-white px-4 text-sm font-semibold text-[#365640] hover:bg-[#f2f6f1]">Annuler</button>
     <button type="submit" disabled={intent.kind==='text'&&!value.trim()} className={`min-h-11 rounded-xl px-5 text-sm font-semibold text-white disabled:opacity-40 ${intent.danger?'bg-[#a63e39] hover:bg-[#892c29]':'bg-[#2f7048] hover:bg-[#24583a]'}`}>{intent.confirmLabel??(intent.kind==='text'?'Enregistrer':'Confirmer')}</button>
    </div>
   </form>
  </div>
 </div>;
}
