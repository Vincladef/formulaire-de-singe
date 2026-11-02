import type { StudioPageData } from '../../shared/studio';
import { QuestionCard } from './QuestionCard';
export function StudioPreview({pages}:{pages:StudioPageData[]}){
 return <div className="mx-auto max-w-[620px] space-y-7 rounded-[30px] bg-white px-7 py-10 shadow-sm sm:px-12">
   <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#6a996f]">Aperçu du questionnaire</p>
   {pages.map((page,index)=><section key={page.id} className="space-y-5">
     <div><p className="text-xs text-[#91a493]">Page {index+1}/{pages.length}</p><h2 className="mt-2 text-2xl font-bold text-[#2c4937]">{page.title||'Sans titre'}</h2>{page.description&&<p className="mt-2 text-sm text-[#809283]">{page.description}</p>}</div>
     {page.questions.length===0&&<p className="rounded-xl border border-dashed p-4 text-sm text-[#99a99b]">Aucune question sur cette page.</p>}
     {page.questions.map((q,i)=><QuestionCard key={q.id} question={q} index={i} selected={false} onSelect={()=>{}} onMove={()=>{}} onDuplicate={()=>{}} onDelete={()=>{}} onDrop={()=>{}} readOnly/>)}
   </section>)}
   <p className="text-center text-xs text-[#9caaa0]">Prévisualisation uniquement · aucune réponse n'est collectée</p>
 </div>;
}
