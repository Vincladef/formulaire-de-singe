import { audioLimits,audioMode } from '../../shared/audio';
import { QuestionField } from '../../pages/PublicFormPage';
import type { StudioPageData } from '../../shared/studio';
export function StudioPreview({pages,title}:{pages:StudioPageData[];title?:string}){
 return <div className="mx-auto max-w-[740px] space-y-4 rounded-[25px] bg-[#fafcf8] px-4 py-8 sm:px-8">
  <p className="mb-6 rounded-lg bg-[#edf6ec] p-3 text-center text-xs font-semibold text-[#4b7554]">APERÇU · AUCUNE RÉPONSE N’EST ENREGISTRÉE</p>
  <div className="mb-8 flex items-center justify-between text-xs font-semibold uppercase tracking-[.12em] text-[#8da18f]">
   <span>Questionnaire</span><span>{pages.length} page(s)</span>
  </div>
  {pages.map((page,index)=><section key={page.id} className="space-y-4">
    {index===0&&<h1 className="font-display text-4xl font-extrabold text-[#254632]">{title||'Votre questionnaire'}</h1>}
    <header className="pb-5 pt-5">
      <h2 className="font-display text-2xl font-bold text-[#35583f]">{page.title||`Page ${index+1}`}</h2>
      {page.description&&<p className="mt-3 whitespace-pre-line text-sm leading-7 text-[#819385]">{page.description}</p>}
    </header>
    <fieldset disabled aria-label={`Aperçu de la page ${index+1}`} className="space-y-4">
      {page.questions.map(q=>{
       const limits=audioLimits(q.settings);
       return <QuestionField key={q.id} question={{id:q.id,type:q.type,label:q.label,description:q.description,
         required:q.required,settings:q.type==='statement'?q.settings:undefined,options:q.options.map(o=>({value:o.value,label:o.label})),
         mode:audioMode(q.type,q.settings),maxAudioSeconds:limits.maxSeconds,maxAudioBytes:limits.maxBytes}}
         value={undefined} onChange={()=>{}}/>;
      })}
    </fieldset>
  </section>)}
  <p className="pt-6 text-center text-xs text-[#9caaa0]">La présentation reprend les champs du formulaire public ; les commandes sont désactivées dans cet aperçu.</p>
 </div>;
}
