import { Plus,Trash2 } from 'lucide-react';
import { questionTypeNames, questionTypes, type StudioQuestion, type QuestionType } from '../../shared/studio';
const input='w-full rounded-xl border border-[#dce7db] bg-white px-3.5 py-2.5 text-sm text-[#3a5845] outline-none focus:border-[#79a386] focus:ring-2 focus:ring-[#d7e8d8]';
type Props={question:StudioQuestion;onUpdate:(question:StudioQuestion)=>void};
export function QuestionSettings({question,onUpdate}:Props){
  const choice=['single_choice','multiple_choice','select'].includes(question.type);
  const change=(update:Partial<StudioQuestion>)=>onUpdate({...question,...update});
  return <section aria-label="Paramètres de la question" className="space-y-5">
    <div><p className="text-xs font-semibold uppercase tracking-[.12em] text-[#8da18f]">Personnalisation</p><h3 className="mt-1 text-lg font-bold text-[#284634]">Question sélectionnée</h3></div>
    <label className="block space-y-2 text-xs font-semibold text-[#607666]">Type de réponse
      <select className={input} value={question.type} onChange={e=>{
        const type=e.target.value as QuestionType;
        const opts=['single_choice','multiple_choice','select'].includes(type)?(question.options.length>=2?question.options:[1,2].map(i=>({id:crypto.randomUUID(),value:`option_${i}`,label:`Option ${i}`}))):[];
        change({type,required:type==='statement'?false:question.required,options:opts});
      }}>{questionTypes.map(t=><option key={t} value={t}>{questionTypeNames[t]}</option>)}</select>
    </label>
    <label className="block space-y-2 text-xs font-semibold text-[#607666]">Intitulé
      <textarea className={input} rows={3} maxLength={600} value={question.label} onChange={e=>change({label:e.target.value})}/>
    </label>
    <label className="block space-y-2 text-xs font-semibold text-[#607666]">Description <span className="font-normal text-[#9ca99e]">(facultatif)</span>
      <textarea className={input} rows={3} value={question.description??''} onChange={e=>change({description:e.target.value||null})}/>
    </label>
    {question.type!=='statement'&&<label className="flex items-center justify-between rounded-xl border border-[#e2e9df] bg-[#f9fbf8] px-3 py-3 text-sm font-medium text-[#47614e]">Réponse obligatoire
      <input type="checkbox" className="h-4 w-4 accent-[#327454]" checked={question.required} onChange={e=>change({required:e.target.checked})}/>
    </label>}
    {choice&&<div className="space-y-3"><p className="text-xs font-semibold text-[#607666]">Choix proposés</p>
      {question.options.map((opt,i)=><div key={opt.id} className="flex items-center gap-2"><input aria-label={`Choix ${i+1}`} className={input} value={opt.label} onChange={e=>{
        const options=question.options.map(o=>o.id===opt.id?{...o,label:e.target.value}:o);change({options});
      }}/><button type="button" disabled={question.options.length<=2} title="Retirer le choix" aria-label={`Retirer le choix ${i+1}`} className="rounded-lg p-2 text-[#a77770] disabled:opacity-30" onClick={()=>change({options:question.options.filter(o=>o.id!==opt.id)})}><Trash2 size={16}/></button></div>)}
      <button type="button" className="inline-flex items-center gap-2 text-xs font-semibold text-[#4f8660]" onClick={()=>{
        const value=`option_${crypto.randomUUID().slice(0,8)}`;change({options:[...question.options,{id:crypto.randomUUID(),value,label:`Option ${question.options.length+1}`}]});
      }}><Plus size={15}/> Ajouter un choix</button>
    </div>}
    {question.type==='audio'&&<div className="rounded-xl bg-[#f0f6ee] p-3 text-xs leading-5 text-[#65806d]">Le champ vocal est configurable dès maintenant. L’enregistrement et le stockage audio seront ajoutés à l’étape 6.</div>}
    <div className="border-t border-[#e7ece4] pt-4 text-[11px] leading-5 text-[#9ba89c]">Les changements sont sauvegardés automatiquement dans le brouillon.</div>
  </section>;
}
