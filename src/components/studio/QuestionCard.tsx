import { useState } from 'react';
import { ArrowDown,ArrowUp,Copy,GripVertical,Trash2,Check,Mic } from 'lucide-react';
import { questionTypeNames, type StudioQuestion } from '../../shared/studio';

type Props={question:StudioQuestion;index:number;selected:boolean;onSelect:()=>void;onMove:(delta:number)=>void;onDuplicate:()=>void;onDelete:()=>void;onDrop:(from:number)=>void;readOnly?:boolean};
export function QuestionCard({question,index,selected,onSelect,onMove,onDuplicate,onDelete,onDrop,readOnly=false}:Props){
  const [dragOver,setDragOver]=useState(false);
  const choice=['single_choice','multiple_choice','select'].includes(question.type);
  return <article data-testid={`question-${question.id}`} draggable={!readOnly} onDragStart={e=>{e.dataTransfer.setData('text/plain',String(index));e.dataTransfer.effectAllowed='move';}}
     onDragOver={e=>{if(!readOnly){e.preventDefault();setDragOver(true);}}} onDragLeave={()=>setDragOver(false)}
     onDrop={e=>{e.preventDefault();setDragOver(false);const from=Number(e.dataTransfer.getData('text/plain'));if(Number.isInteger(from)&&from!==index)onDrop(from);}}
     className={`group rounded-[22px] border bg-white p-5 shadow-[0_7px_25px_rgba(25,57,37,.025)] transition ${dragOver?'border-[#4e9571] ring-2 ring-[#a6c9af]':selected?'border-[#6c9e7b] ring-2 ring-[#d7e9dc]':'border-[#e7eae3] hover:border-[#d2dfd1]'}`}>
    <div className="flex items-start gap-3">
      {!readOnly&&<span title="Déplacer la question en la faisant glisser" className="mt-1 cursor-grab text-[#9daa9e]" aria-hidden="true"><GripVertical size={18}/></span>}
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left" aria-label={`Modifier : ${question.label}`}>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[.14em] text-[#7e9b83]">{String(index+1).padStart(2,'0')} · {questionTypeNames[question.type]}</p>
        <h3 className="text-lg font-semibold leading-snug tracking-tight text-[#2f4335]">{question.label}{question.required&&<span className="ml-1 text-[#cb7d60]">*</span>}</h3>
        {question.description&&<p className="mt-2 text-sm leading-6 text-[#8c9d8d]">{question.description}</p>}
      </button>
    </div>
    <div className="ml-0 mt-5 sm:ml-7">
      {(question.type==='short_text'||question.type==='number'||question.type==='date')&&<div className="rounded-xl border border-dashed border-[#e0e7df] bg-[#fafbf9] px-4 py-3 text-sm text-[#a3afa6]">{question.type==='number'?'0':question.type==='date'?'JJ / MM / AAAA':'Votre réponse...'}</div>}
      {question.type==='long_text'&&<div className="min-h-20 rounded-xl border border-dashed border-[#e0e7df] bg-[#fafbf9] px-4 py-3 text-sm text-[#a3afa6]">Rédigez votre réponse…</div>}
      {choice&&<div className="space-y-2">{question.options.map(o=><div key={o.id} className="flex items-center gap-3 text-sm text-[#687b6d]"><span className={`flex h-[18px] w-[18px] items-center justify-center border border-[#bfcfc2] ${question.type==='multiple_choice'?'rounded-[5px]':'rounded-full'}`}/>{o.label}</div>)}</div>}
      {question.type==='audio'&&<div className="flex items-center gap-3 rounded-2xl bg-[#edf5ef] p-4 text-sm font-semibold text-[#47745a]"><Mic size={19}/> Le répondant pourra enregistrer sa voix <span className="ml-auto text-[11px] font-normal">Étape 6</span></div>}
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
