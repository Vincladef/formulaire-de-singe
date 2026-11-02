import { useEffect, useState } from 'react';
import { audioLimits, audioMode } from '../../shared/audio';
import { ArrowDown,ArrowUp,Copy,GripVertical,Trash2,Check,Mic } from 'lucide-react';
import { OTHER_VALUE } from '../../shared/publicForm';
import { questionTypeNames, type StudioQuestion } from '../../shared/studio';

type Props={question:StudioQuestion;index:number;selected:boolean;onSelect:()=>void;onUpdate?:(question:StudioQuestion)=>void;onMove:(delta:number)=>void;onDuplicate:()=>void;onDelete:()=>void;onDrop:(from:number)=>void;readOnly?:boolean};
export function QuestionCard({question,index,selected,onSelect,onUpdate,onMove,onDuplicate,onDelete,onDrop,readOnly=false}:Props){
  const [dragOver,setDragOver]=useState(false);
  const [localTitle,setLocalTitle]=useState(question.label);
  const [localDescription,setLocalDescription]=useState(question.description??'');
  const [choiceLabels,setChoiceLabels]=useState<Record<string,string>>({});
  useEffect(()=>setLocalTitle(question.label),[question.label]);
  useEffect(()=>setLocalDescription(question.description??''),[question.description]);
  function commitTitle(){const next=localTitle.trim();if(next&&next!==question.label)onUpdate?.({...question,label:next});else setLocalTitle(question.label);}
  function commitDescription(){const next=localDescription.trim()||null;if(next!==question.description)onUpdate?.({...question,description:next});}
  function commitOption(id:string){
    const option=question.options.find(o=>o.id===id);
    if(option){const next=(choiceLabels[id]??option.label).trim();if(next&&next!==option.label)
      onUpdate?.({...question,options:question.options.map(o=>o.id===id?{...o,label:next}:o)});}
    setChoiceLabels(labels=>{const next={...labels};delete next[id];return next;});
  }
  const choice=['single_choice','multiple_choice','select'].includes(question.type);
 const hasOther=question.options.some(o=>o.value===OTHER_VALUE);
 function addChoice(){if(question.options.length>=100)return;
  onUpdate?.({...question,options:[...question.options,{id:crypto.randomUUID(),value:'option_'+crypto.randomUUID().slice(0,8),label:'Option '+(question.options.length+1)}]});}
 function addOther(){if(hasOther||question.options.length>=100)return;
  onUpdate?.({...question,options:[...question.options,{id:crypto.randomUUID(),value:OTHER_VALUE,label:'Autre'}]});}
  return <article data-testid={`question-${question.id}`}
     onDragOver={e=>{if(!readOnly){e.preventDefault();setDragOver(true);}}} onDragLeave={()=>setDragOver(false)}
     onDrop={e=>{e.preventDefault();setDragOver(false);const from=Number(e.dataTransfer.getData('text/plain'));if(Number.isInteger(from)&&from!==index)onDrop(from);}}
     className={`group rounded-[22px] border bg-white p-5 shadow-[0_7px_25px_rgba(25,57,37,.025)] transition ${dragOver?'border-[#4e9571] ring-2 ring-[#a6c9af]':selected?'border-[#6c9e7b] ring-2 ring-[#d7e9dc]':'border-[#e7eae3] hover:border-[#d2dfd1]'}`}>
    <div className="flex items-start gap-3">
      {!readOnly&&<span title="Déplacer la question" draggable className="mt-1 cursor-grab text-[#9daa9e] active:cursor-grabbing" aria-hidden="true" onDragStart={e=>{e.dataTransfer.setData('text/plain',String(index));e.dataTransfer.effectAllowed='move';}}><GripVertical size={18}/></span>}
      <div className="min-w-0 flex-1">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[.14em] text-[#7e9b83]">{String(index+1).padStart(2,'0')} · {questionTypeNames[question.type]}</p>
        {readOnly?<h3 className="text-lg font-semibold leading-snug text-[#2f4335]">{question.label}</h3>:
        <textarea aria-label={`Intitulé de la question ${index+1}`} rows={Math.max(1,Math.min(5,Math.ceil(localTitle.length/55)))}
          maxLength={600} placeholder="Écrivez votre question…" value={localTitle}
          className="block w-full resize-y rounded-lg border border-transparent bg-transparent p-1 text-lg font-semibold leading-snug tracking-tight text-[#2f4335] outline-none hover:border-[#dce9dc] focus:border-[#90b59a] focus:ring-2 focus:ring-[#e0efdf]"
          onFocus={onSelect} onChange={e=>setLocalTitle(e.target.value)} onBlur={commitTitle}
          onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();e.currentTarget.blur();}}}/>}
        {readOnly?question.description&&<p className="mt-2 text-sm leading-6 text-[#8c9d8d]">{question.description}</p>:
        <textarea aria-label={`Description de la question ${index+1}`} rows={localDescription?2:1} maxLength={3000}
          value={localDescription} placeholder="Ajouter une description (facultatif)…"
          className="mt-1 block w-full resize-y rounded-lg border border-transparent bg-transparent p-1 text-sm leading-6 text-[#788d7b] outline-none hover:border-[#dce9dc] focus:border-[#90b59a] focus:ring-2 focus:ring-[#e0efdf] placeholder:text-[#a9b8aa]"
          onFocus={onSelect} onChange={e=>setLocalDescription(e.target.value)} onBlur={commitDescription}/>}
      </div>
    </div>
    <div className="ml-0 mt-5 sm:ml-7">
      {(question.type==='short_text'||question.type==='number'||question.type==='date')&&<div className="rounded-xl border border-dashed border-[#e0e7df] bg-[#fafbf9] px-4 py-3 text-sm text-[#a3afa6]">{question.type==='number'?'0':question.type==='date'?'JJ / MM / AAAA':'Votre réponse...'}</div>}
      {question.type==='long_text'&&<div className="min-h-20 rounded-xl border border-dashed border-[#e0e7df] bg-[#fafbf9] px-4 py-3 text-sm text-[#a3afa6]">Rédigez votre réponse…</div>}
      {choice&&<div className="space-y-2">{question.options.map((o,i)=><div key={o.id} className="flex items-center gap-3 text-sm text-[#687b6d]">
       <span aria-hidden="true" className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center border border-[#bfcfc2] ${question.type==='multiple_choice'?'rounded-[5px]':'rounded-full'}`}/>
       {readOnly||o.value===OTHER_VALUE?<span className="flex-1">{o.label}</span>:<input aria-label={`Choix ${i+1} de la question ${index+1}`}
        className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-[#526b57] outline-none hover:border-[#dce9dc] focus:border-[#90b59a] focus:ring-2 focus:ring-[#e0efdf]"
        maxLength={180} value={choiceLabels[o.id]??o.label} onFocus={onSelect}
        onChange={e=>setChoiceLabels(v=>({...v,[o.id]:e.target.value}))} onBlur={()=>commitOption(o.id)}/>}
       {!readOnly&&question.options.length>2&&<button type="button" aria-label={`Retirer le choix ${i+1}`} title="Retirer ce choix"
         onClick={()=>onUpdate?.({...question,options:question.options.filter(x=>x.id!==o.id)})}
         className="rounded-lg p-1.5 text-[#b07970] hover:bg-red-50"><Trash2 size={15}/></button>}
      </div>)}
      {!readOnly&&<div className="mt-3 flex flex-wrap gap-2">
       <button type="button" onClick={addChoice} disabled={question.options.length>=100} className="rounded-lg px-2 py-2 text-xs font-semibold text-[#3f8154] hover:bg-[#edf7ed]">+ Ajouter un choix</button>
       {!hasOther&&<button type="button" onClick={addOther} disabled={question.options.length>=100} className="rounded-lg px-2 py-2 text-xs text-[#52765a] hover:bg-[#edf7ed]">+ Ajouter « Autre »</button>}
      </div>}
      </div>}
      {audioMode(question.type,question.settings)!=='text'&&<div className="flex items-center gap-3 rounded-2xl bg-[#edf5ef] p-4 text-sm font-semibold text-[#47745a]"><Mic size={19}/> Réponse vocale possible <span className="ml-auto text-[11px] font-normal">{Math.round(audioLimits(question.settings).maxSeconds/60)} min max.</span></div>}
      {question.type==='statement'&&<div className="text-sm italic text-[#9baa9c]">Bloc d'information, sans réponse attendue</div>}
    </div>
    {!readOnly&&<div className="mt-5 flex flex-wrap items-center justify-end gap-1 border-t border-[#f0f2ed] pt-3 text-[#839487]">
      <button type="button" onClick={()=>onMove(-1)} aria-label={`Monter la question ${index+1}`} title="Monter" className="rounded-lg p-2 hover:bg-[#eef4ec]"><ArrowUp size={16}/></button>
      <button type="button" onClick={()=>onMove(1)} aria-label={`Descendre la question ${index+1}`} title="Descendre" className="rounded-lg p-2 hover:bg-[#eef4ec]"><ArrowDown size={16}/></button>
      <button type="button" onClick={onDuplicate} aria-label="Dupliquer la question" title="Dupliquer" className="rounded-lg p-2 hover:bg-[#eef4ec]"><Copy size={16}/></button>
      <button type="button" onClick={onDelete} aria-label="Supprimer la question" title="Supprimer" className="rounded-lg p-2 text-[#b77874] hover:bg-red-50"><Trash2 size={16}/></button>
      <span className="ml-2 rounded-full bg-[#eaf2e8] p-1.5 text-[#60936a] opacity-0 transition group-hover:opacity-100"><Check size={13}/></span>
    </div>}
  </article>;
}
