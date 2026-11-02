import { useEffect, useRef, useState } from 'react';
import { audioLimits, audioMode } from '../../shared/audio';
import { ArrowDown,ArrowUp,Copy,GripVertical,Trash2,Mic,Plus,Type,Heading2,Quote,Settings2,Ellipsis } from 'lucide-react';
import { OTHER_VALUE } from '../../shared/publicForm';
import { questionTypes,questionTypeNames,type QuestionType,type StudioQuestion } from '../../shared/studio';

type Props={
 question:StudioQuestion;index:number;selected:boolean;onSelect:()=>void;
 onUpdate?:(question:StudioQuestion)=>void;onMove:(delta:number)=>void;
 onDuplicate:()=>void;onDelete:()=>void;onDrop:(from:number)=>void;
 onCursor?:(offset?:number,text?:string)=>void;
 onInsert?:(type:QuestionType,offset?:number,text?:string)=>void;
 onOpenSettings?:()=>void;
 readOnly?:boolean;
};
export function QuestionCard({question,index,selected,onSelect,onUpdate,onMove,onDuplicate,onDelete,onDrop,onCursor,onInsert,onOpenSettings,readOnly=false}:Props){
 const [dragOver,setDragOver]=useState(false);
 const [localTitle,setLocalTitle]=useState(question.label);
 const [localDescription,setLocalDescription]=useState(question.description??'');
 const [choiceLabels,setChoiceLabels]=useState<Record<string,string>>({});
 const [menu,setMenu]=useState(false),[search,setSearch]=useState('');
 const titleRef=useRef<HTMLTextAreaElement>(null);
 const caretRef=useRef(0);
 const skipBlurRef=useRef(false);
 const prose=question.type==='statement';
 const textStyle=String(question.settings.textStyle??'paragraph');
 useEffect(()=>{setLocalTitle(question.label);skipBlurRef.current=false;},[question.label]);
 useEffect(()=>setLocalDescription(question.description??''),[question.description]);
 function commitTitle(){if(skipBlurRef.current)return;const next=localTitle.trim();if(next&&next!==question.label)onUpdate?.({...question,label:next});else if(!next)setLocalTitle(question.label);}
 function commitDescription(){const next=localDescription.trim()||null;if(next!==question.description)onUpdate?.({...question,description:next});}
 function recordCaret(){caretRef.current=titleRef.current?.selectionStart??0;onCursor?.(prose?caretRef.current:undefined,prose?localTitle:undefined);}
 function insert(type:QuestionType){
  const offset=prose?caretRef.current:undefined;
  skipBlurRef.current=true;
  setMenu(false);setSearch('');
  onInsert?.(type,offset,prose?localTitle:undefined);
  requestAnimationFrame(()=>{skipBlurRef.current=false;});
 }
 function commitOption(id:string){
  const option=question.options.find(o=>o.id===id);
  if(option){const next=(choiceLabels[id]??option.label).trim();if(next&&next!==option.label)
   onUpdate?.({...question,options:question.options.map(o=>o.id===id?{...o,label:next}:o)});}
  setChoiceLabels(labels=>{const next={...labels};delete next[id];return next;});
 }
 const choice=['single_choice','multiple_choice','select'].includes(question.type);
 const hasOther=question.options.some(o=>o.value===OTHER_VALUE);
 function addChoice(){if(question.options.length>=100)return;onUpdate?.({...question,options:[...question.options,{id:crypto.randomUUID(),value:'option_'+crypto.randomUUID().slice(0,8),label:'Option '+(question.options.length+1)}]});}
 function addOther(){if(hasOther||question.options.length>=100)return;onUpdate?.({...question,options:[...question.options,{id:crypto.randomUUID(),value:OTHER_VALUE,label:'Autre'}]});}
 const visible=questionTypes.filter(t=>questionTypeNames[t].toLowerCase().includes(search.toLowerCase())||t.includes(search.toLowerCase()));
 return <article data-testid={`question-${question.id}`} data-question-id={question.id}
  onDragOver={e=>{if(!readOnly){e.preventDefault();setDragOver(true);}}}
  onDragLeave={()=>setDragOver(false)}
  onDrop={e=>{e.preventDefault();setDragOver(false);const from=Number(e.dataTransfer.getData('text/plain'));if(Number.isInteger(from)&&from!==index)onDrop(from);}}
  className={`group relative rounded-xl px-2 py-2 transition sm:pl-10 sm:pr-4 ${dragOver?'bg-[#e6f2e9] ring-1 ring-[#98bba4]':selected?'bg-[#f5faf5]':'hover:bg-[#f8faf7]'}`}>
  {!readOnly&&<div className="absolute -left-1 top-3 z-10 flex items-center gap-0.5 sm:left-1">
   <span title="Déplacer la question" draggable onDragStart={e=>{e.dataTransfer.setData('text/plain',String(index));e.dataTransfer.effectAllowed='move';}} className="hidden cursor-grab rounded-md p-1.5 text-[#496b50] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 sm:block"><GripVertical size={15}/></span>
   <button type="button" title="Insérer ici" aria-label={`Insérer après l’élément ${index+1}`} onClick={()=>{onSelect();recordCaret();setMenu(v=>!v);}} className="flex h-9 w-9 items-center justify-center rounded-md text-[#47694e] opacity-80 hover:bg-[#e4efe4] sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"><Plus size={17}/></button>
  </div>}
  {menu&&!readOnly&&<div className="absolute left-2 top-9 z-30 w-64 rounded-xl border border-[#dce8dc] bg-white p-2 shadow-xl sm:left-10">
   <input autoFocus value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')setMenu(false);if(e.key==='Enter'&&visible[0]){e.preventDefault();insert(visible[0]);}}} placeholder="Rechercher un élément…" aria-label="Rechercher un type d’élément" className="w-full rounded-lg border border-[#e1ebe0] px-2 py-2 text-sm outline-none focus:border-[#559266]"/>
   <div className="mt-1 max-h-64 overflow-y-auto">{visible.map(t=><button type="button" key={t} onClick={()=>insert(t)} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-[#3d6249] hover:bg-[#edf5eb]">{t==='statement'?'Paragraphe':questionTypeNames[t]}</button>)}</div>
  </div>}
  <div className="min-w-0">
   {!prose&&<p className="mb-1 text-xs font-semibold tracking-wide text-[#607265]">{String(index+1).padStart(2,'0')} · {questionTypeNames[question.type]}</p>}
   {readOnly?<h3 className={prose?(textStyle==='heading'?'text-2xl font-bold':textStyle==='quote'?'border-l-2 border-[#9ebb9f] pl-3 italic text-[#657b6a]':'text-base leading-8'):'text-lg font-semibold'}>{question.label}</h3>:
   <textarea ref={titleRef} aria-label={prose?'Texte du document':`Intitulé de la question ${index+1}`}
    rows={prose?Math.max(1,Math.ceil(localTitle.length/75)):Math.max(1,Math.ceil(localTitle.length/65))}
    maxLength={prose?600:600} value={localTitle}
    placeholder={prose?'Écrivez votre texte…':'Écrivez votre question…'}
    className={`block w-full resize-none bg-transparent px-0 py-1 outline-none placeholder:text-[#b0c0b2] ${prose?(textStyle==='heading'?'text-2xl font-bold tracking-tight':textStyle==='quote'?'border-l-[3px] border-[#b4cab6] pl-3 text-base italic leading-7':'text-base font-normal leading-8'):'text-lg font-semibold leading-7 tracking-tight'} text-[#2c4535]`}
    onFocus={e=>{onSelect();if(prose&&localTitle==='Votre texte ici…')e.currentTarget.select();recordCaret();}} onClick={recordCaret} onKeyUp={recordCaret}
    onChange={e=>{setLocalTitle(e.target.value);caretRef.current=e.target.selectionStart;onCursor?.(prose?e.target.selectionStart:undefined,prose?e.target.value:undefined);}}
    onBlur={commitTitle}
    onKeyDown={e=>{if(prose&&e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&
       (localTitle.trim()===''||(localTitle==='Votre texte ici…'&&e.currentTarget.selectionStart===0&&e.currentTarget.selectionEnd===localTitle.length))){e.preventDefault();recordCaret();setMenu(true);return;}
      if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(prose){insert('statement');}else{e.currentTarget.blur();}}}}
   />}
   {prose&&!readOnly&&selected&&<div className="my-1 flex items-center gap-1 text-[#64836b]">
    {([{key:'paragraph',label:'Paragraphe',Icon:Type},{key:'heading',label:'Titre',Icon:Heading2},{key:'quote',label:'Citation',Icon:Quote}] as const).map(x=><button key={x.key} type="button" title={x.label} aria-label={x.label} aria-pressed={textStyle===x.key}
     onClick={()=>onUpdate?.({...question,settings:{...question.settings,textStyle:x.key}})}
     className={`rounded-md px-1.5 py-1 ${textStyle===x.key?'bg-[#dfecdf] text-[#316c43]':'hover:bg-[#edf4ed]'}`}><x.Icon size={14}/></button>)}
    <span className="ml-2 text-[11px] text-[#9bad9e]">/ pour insérer · Entrée pour un paragraphe</span>
   </div>}
   {!prose&&(readOnly?question.description&&<p className="mt-1 text-sm leading-6 text-[#819486]">{question.description}</p>:
   <textarea aria-label={`Description de la question ${index+1}`} rows={localDescription?2:1} maxLength={3000}
    value={localDescription} placeholder="Ajouter une description (facultatif)…" className="mt-1 block w-full resize-none bg-transparent text-sm leading-6 text-[#607265] outline-none placeholder:text-[#7c8d7e]"
    onFocus={()=>{onSelect();onCursor?.();}} onChange={e=>setLocalDescription(e.target.value)} onBlur={commitDescription}/>)}
  </div>
  {!prose&&<div className="mt-3">
   {(question.type==='short_text'||question.type==='number'||question.type==='date')&&<div className="border-b border-dashed border-[#dbe5da] pb-2 text-sm text-[#a5b2a8]">{question.type==='number'?'0':question.type==='date'?'JJ / MM / AAAA':'Votre réponse...'}</div>}
   {question.type==='long_text'&&<div className="min-h-12 border-b border-dashed border-[#dbe5da] py-2 text-sm text-[#a5b2a8]">Rédigez votre réponse…</div>}
   {choice&&<div className="space-y-1">{question.options.map((o,i)=><div key={o.id} className="flex items-center gap-2 text-sm text-[#63786a]">
    <span aria-hidden="true" className={`h-4 w-4 shrink-0 border border-[#b7cbb9] ${question.type==='multiple_choice'?'rounded':'rounded-full'}`}/>
    {readOnly||o.value===OTHER_VALUE?<span className="flex-1">{o.label}</span>:<input aria-label={`Choix ${i+1} de la question ${index+1}`} value={choiceLabels[o.id]??o.label} maxLength={180}
    className="min-h-10 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 outline-none focus:border-[#a7c8aa]"
    onFocus={()=>{onSelect();onCursor?.();}} onChange={e=>setChoiceLabels(v=>({...v,[o.id]:e.target.value}))} onBlur={()=>commitOption(o.id)}/>}
    {!readOnly&&question.options.length>2&&<button type="button" aria-label={`Retirer le choix ${i+1}`} onClick={()=>onUpdate?.({...question,options:question.options.filter(x=>x.id!==o.id)})} className="p-1 text-[#a67f79] opacity-30 hover:opacity-100"><Trash2 size={14}/></button>}
   </div>)}
   {!readOnly&&<div className="mt-2 flex gap-3 text-xs"><button type="button" onClick={addChoice} disabled={question.options.length>=100} className="text-[#418157]">+ Choix</button>{!hasOther&&<button type="button" onClick={addOther} className="text-[#678471]">+ Autre</button>}</div>}</div>}
   {audioMode(question.type,question.settings)!=='text'&&<div className="mt-3 flex items-center gap-2 rounded-lg bg-[#edf5ef] px-3 py-2 text-xs text-[#47745a]"><Mic size={15}/> Réponse vocale possible <span className="ml-auto">{Math.round(audioLimits(question.settings).maxSeconds/60)} min max.</span></div>}
  </div>}
  {!readOnly&&selected&&<div className="mt-2 flex items-center justify-end gap-1.5">
   {onOpenSettings&&<button type="button" onClick={onOpenSettings} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-[#41674e] hover:bg-[#e7f0e6]"><Settings2 size={16}/> Options</button>}
   <details className="group/menu relative" onKeyDown={e=>{if(e.key==='Escape')e.currentTarget.removeAttribute('open');}}>
    <summary aria-label="Autres actions sur la question" title="Autres actions" className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg text-[#41674e] hover:bg-[#e7f0e6] focus-visible:outline-2 focus-visible:outline-[#36774e] [&::-webkit-details-marker]:hidden"><Ellipsis size={19}/></summary>
    <div className="absolute right-0 top-11 z-20 w-44 rounded-xl border border-[#dce8dc] bg-white p-1.5 shadow-xl">
     <button type="button" onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');onMove(-1);}} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-[#406149] hover:bg-[#eff5ed]"><ArrowUp size={16}/> Monter</button>
     <button type="button" onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');onMove(1);}} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-[#406149] hover:bg-[#eff5ed]"><ArrowDown size={16}/> Descendre</button>
     <button type="button" onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');onDuplicate();}} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-[#406149] hover:bg-[#eff5ed]"><Copy size={16}/> Dupliquer</button>
     <button type="button" onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');onDelete();}} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-[#a34e47] hover:bg-red-50"><Trash2 size={16}/> Supprimer</button>
    </div>
   </details>
  </div>}

