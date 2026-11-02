import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { FormAppearance } from '../FormAppearance';
import type { StudioPageData } from '../../shared/studio';
import type { FormTheme } from '../../shared/theme';
import { readFormTheme } from '../../shared/theme';
import { QuestionCard } from './QuestionCard';

/** A safe preview of layout and typography; it never stores respondent answers. */
export function StudioPreview({pages,theme}:{pages:StudioPageData[];theme?:FormTheme}){
 const [step,setStep]=useState(0);
 const t=readFormTheme(theme);
 const entries=t.layout==='questions' ? pages.flatMap((page,pageIndex)=>page.questions.length
   ? page.questions.map(q=>({page,pageIndex,questions:[q]}))
   : [{page,pageIndex,questions:[] as StudioPageData['questions']}])
   : pages.map((page,pageIndex)=>({page,pageIndex,questions:page.questions}));
 const active=Math.min(step,Math.max(0,entries.length-1));
 const current=entries[active];
 useEffect(()=>setStep(0),[t.layout]);
 return <FormAppearance theme={t} className="rounded-[28px] px-4 py-8 sm:px-8">
  <div className="mx-auto max-w-[680px] space-y-6 rounded-[24px] border border-black/5 bg-white p-6 shadow-sm sm:p-9">
   <div className="flex flex-wrap items-center justify-between gap-3"><p className="form-subtle text-xs font-bold uppercase tracking-[.16em]">Aperçu, sans collecte</p><span className="text-xs text-[#738575]">{entries.length?active+1:0} / {entries.length} étape(s)</span></div>
   {current && <section key={`${current.page.id}-${active}`} className="space-y-5">
     <div><p className="text-xs text-[#829085]">Page {current.pageIndex+1} sur {pages.length}</p><h2 className="form-title mt-2 text-2xl font-bold">{current.page.title||'Sans titre'}</h2>{current.page.description&&<p className="mt-2 text-sm text-[#728378]">{current.page.description}</p>}</div>
     {current.questions.length===0&&<p className="rounded-xl border border-dashed p-4 text-sm text-[#819286]">Aucune question sur cette page.</p>}
     {current.questions.map((q,i)=><QuestionCard key={q.id} question={q} index={i} selected={false} onSelect={()=>{}} onMove={()=>{}} onDuplicate={()=>{}} onDelete={()=>{}} onDrop={()=>{}} readOnly/>)}
   </section>}
   <div className="flex items-center justify-between gap-3 border-t border-[#edf0ec] pt-5"><button type="button" disabled={active===0} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[#61766a] disabled:opacity-35" onClick={()=>setStep(n=>Math.max(0,n-1))}><ArrowLeft size={16}/> Retour</button><button className="form-primary inline-flex min-h-12 items-center gap-2 px-6 text-sm font-semibold disabled:opacity-45" type="button" disabled={active>=entries.length-1} onClick={()=>setStep(n=>Math.min(entries.length-1,n+1))}>Continuer <ArrowRight size={16}/></button></div>
   <p className="text-center text-xs text-[#819286]">Les réponses ne sont pas collectées en prévisualisation.</p>
  </div>
 </FormAppearance>;
}
