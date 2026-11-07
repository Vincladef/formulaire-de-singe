import { useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, RotateCcw } from 'lucide-react';
import { audioLimits,audioMode } from '../../shared/audio';
import { evaluateLogic } from '../../shared/conditionalLogic';
import type { AnswerValues } from '../../shared/publicForm';
import { QuestionField } from '../../pages/PublicFormPage';
import type { StudioPageData } from '../../shared/studio';

export function StudioPreview({pages,title}:{pages:StudioPageData[];title?:string}){
 const [answers,setAnswers]=useState<AnswerValues>({});
 const [pageIndex,setPageIndex]=useState(0);
 const journey=evaluateLogic(pages,answers);
 const available=journey.pageIndices;
 const current=available.includes(pageIndex)?pageIndex:(available.find(i=>i>pageIndex)??available.at(-1)??0);
 const previous=available.filter(i=>i<current).at(-1);
 const next=available.find(i=>i>current);
 const page=pages[current];
 const count=pages.flatMap(p=>p.questions).filter(q=>q.type!=='statement'&&journey.visibleIds.has(q.id)).length;
 return <div className="mx-auto max-w-[740px] space-y-4 rounded-[25px] bg-[#fafcf8] px-4 py-8 sm:px-8">
  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#edf6ec] p-3 text-xs font-semibold text-[#4b7554]">
   <span className="inline-flex items-center gap-2"><Eye size={15}/> APERÇU INTERACTIF · AUCUNE RÉPONSE ENREGISTRÉE</span>
   <button type="button" className="inline-flex items-center gap-1 underline" onClick={()=>{setAnswers({});setPageIndex(0);}}><RotateCcw size={13}/> Recommencer</button>
  </div>
  {page&&<>
   <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[.12em] text-[#789280]">
    <span>Questionnaire</span><span>Étape {available.indexOf(current)+1} sur {available.length} · {count} questions visibles</span>
   </div>
   {current===0&&<h1 className="font-display text-4xl font-extrabold text-[#254632]">{title||'Votre questionnaire'}</h1>}
   <header className="pb-5 pt-5">
    <h2 className="font-display text-2xl font-bold text-[#35583f]">{page.title||'Page '+(current+1)}</h2>
    {page.description&&<p className="mt-3 whitespace-pre-line text-sm leading-7 text-[#819385]">{page.description}</p>}
   </header>
   <div className="space-y-4">
    {page.questions.filter(q=>journey.visibleIds.has(q.id)).map(q=>{
     const limits=audioLimits(q.settings);
     return <QuestionField key={q.id} question={{id:q.id,type:q.type,label:q.label,description:q.description,
       required:journey.requiredIds.has(q.id),settings:q.settings,options:q.options.map(o=>({value:o.value,label:o.label})),
       mode:audioMode(q.type,q.settings),maxAudioSeconds:limits.maxSeconds,maxAudioBytes:limits.maxBytes}}
       value={answers[q.id]} onChange={value=>setAnswers(prev=>({...prev,[q.id]:value}))}/>;
    })}
   </div>
   <nav className="flex flex-wrap items-center justify-between gap-3 pt-5" aria-label="Navigation de l'aperçu conditionnel">
    {previous!==undefined?<button type="button" onClick={()=>setPageIndex(previous)} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[#416b4c]"><ArrowLeft size={16}/> Retour</button>:<span/>}
    {next!==undefined?<button type="button" onClick={()=>setPageIndex(next)} className="inline-flex items-center gap-2 rounded-xl bg-[#36734b] px-4 py-2 text-sm font-semibold text-white">Continuer <ArrowRight size={16}/></button>:
      <span className="text-xs font-semibold text-[#5c8667]">Fin du parcours · aucune réponse ne sera envoyée</span>}
   </nav>
  </>}
 </div>;
}
