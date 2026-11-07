import { GitBranch, Plus, Trash2 } from 'lucide-react';
import { logicKey, readLogic, type BranchLogic, type LogicCondition, type LogicGroup, type LogicOperator, type QuestionLogic, type VisibilityLogic } from '../../shared/conditionalLogic';
import type { StudioPageData, StudioQuestion } from '../../shared/studio';

const field = 'min-h-10 w-full rounded-lg border border-[#dae6d8] bg-white px-2.5 py-2 text-sm text-[#2e5240] outline-none focus:border-[#679d70]';
const operators: { value: LogicOperator; label: string }[] = [
 {value:'equals',label:'Est égal à'}, {value:'not_equals',label:'Est différent de'},
 {value:'contains',label:'Contient'}, {value:'not_contains',label:'Ne contient pas'},
 {value:'is_empty',label:'Est vide'}, {value:'not_empty',label:'Est renseigné'},
 {value:'greater_than',label:'Est supérieur à'}, {value:'less_than',label:'Est inférieur à'},
];
type Section = 'visibility' | 'requiredWhen' | 'branch';
type Props = {
 pages: StudioPageData[]; pageIndex: number;
 question: StudioQuestion; onUpdate: (q: StudioQuestion) => void;
};
export function ConditionalLogicPanel({pages,pageIndex,question,onUpdate}:Props){
 const all = pages.flatMap((page,p) => page.questions.map((q,i)=>({page:p,index:i,q})));
 const current = all.findIndex(item=>item.q.id===question.id);
 const sources = all.slice(0,current).filter(item=>item.q.type!=='statement');
 const branchSources = all.slice(0,current+1).filter(item=>item.q.type!=='statement');
 const destinationPages = pages.map((page,index)=>({index,page})).filter(item=>item.index>pageIndex && item.page.questions.length>0);
 const logic = readLogic(question);
 const sourceByKey = new Map(all.map(item=>[logicKey(item.q),item.q]));
 const createCondition = (allowSelf:boolean):LogicCondition | undefined => {
  const available = allowSelf ? branchSources : sources;
  const first=available[0]?.q;
  if(!first)return undefined;
  return {sourceKey:logicKey(first),operator:'equals',value:first.options?.[0]?.value??''};
 };
 function setLogic(name:Section,next:LogicGroup|VisibilityLogic|BranchLogic|undefined){
  const updated:QuestionLogic={...logic};
  if(next)Object.assign(updated,{[name]:next});
  else delete updated[name];
  onUpdate({...question,settings:{...question.settings,logic:updated}});
 }
 function add(name:Section){
  const first=createCondition(name==='branch');
  if(!first)return;
  if(name==='visibility')setLogic(name,{action:'show',match:'all',conditions:[first]});
  else if(name==='requiredWhen')setLogic(name,{match:'all',conditions:[first]});
  else setLogic(name,{target:destinationPages[0]?logicKey(destinationPages[0].page.questions[0]):'END',match:'all',conditions:[first]});
 }
 function updateGroup(name:Section,patch:Record<string,unknown>){
  const before=logic[name];
  if(!before)return;
  setLogic(name,{...before,...patch} as LogicGroup);
 }
 function changeCondition(name:Section,index:number,patch:Partial<LogicCondition>){
  const group=logic[name];
  if(!group)return;
  const conditions=group.conditions.map((condition,i)=>i===index?{...condition,...patch}:condition);
  updateGroup(name,{conditions});
 }
 function renderRules(name:Section,heading:string,description:string){
  const group=logic[name];
  const available=name==='branch'?branchSources:sources;
  return <section className="space-y-2 border-t border-[#e5ede4] pt-4" aria-label={heading}>
   <h4 className="text-sm font-bold text-[#315843]">{heading}</h4>
   <p className="text-xs leading-5 text-[#708476]">{description}</p>
   {!group?<button type="button" disabled={available.length===0} onClick={()=>add(name)}
     className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#9dbca2] py-2.5 text-xs font-semibold text-[#35774b] disabled:opacity-40"><Plus size={14}/> Ajouter une règle</button>:
   <div className="space-y-3 rounded-xl bg-[#f6faf5] p-2.5">
    {name==='visibility'&&<label className="block space-y-1 text-xs font-semibold text-[#57715c]">Comportement
     <select aria-label="Action de visibilité" className={field} value={(group as VisibilityLogic).action}
      onChange={e=>updateGroup(name,{action:e.target.value})}>
      <option value="show">Afficher si...</option><option value="hide">Masquer si...</option>
     </select></label>}
    {name==='branch'&&<label className="block space-y-1 text-xs font-semibold text-[#57715c]">Destination si la règle correspond
      <select aria-label="Page de destination" className={field} value={(group as BranchLogic).target}
       onChange={e=>updateGroup(name,{target:e.target.value})}>
       {destinationPages.map(({page,index})=><option key={page.id} value={logicKey(page.questions[0])}>Page {index+1} : {page.title}</option>)}
       <option value="END">Terminer le formulaire</option>
      </select></label>}
    <label className="block space-y-1 text-xs font-semibold text-[#57715c]">Combinaison
      <select aria-label="Combiner les conditions" className={field} value={group.match}
       onChange={e=>updateGroup(name,{match:e.target.value})}>
       <option value="all">Toutes les conditions (ET)</option><option value="any">Au moins une condition (OU)</option>
      </select>
    </label>
    {group.conditions.map((condition,i)=>{
     const source=sourceByKey.get(condition.sourceKey);
     const choice=source&&['single_choice','multiple_choice','select'].includes(source.type);
     const noValue=condition.operator==='is_empty'||condition.operator==='not_empty';
     return <div key={i} className="space-y-2 rounded-lg border border-[#e0e9de] bg-white p-2">
      <label className="block space-y-1 text-[11px] font-semibold text-[#607762]">Question à examiner
       <select aria-label={'Source condition '+(i+1)} className={field} value={condition.sourceKey} onChange={e=>{
        const next=sourceByKey.get(e.target.value);
        changeCondition(name,i,{sourceKey:e.target.value,value:next?.options?.[0]?.value??''});
       }}>
        {available.map(({q,page})=><option key={q.id} value={logicKey(q)}>P{page+1} · {q.label.slice(0,65)}</option>)}
       </select>
      </label>
      <label className="block space-y-1 text-[11px] font-semibold text-[#607762]">Comparaison
       <select aria-label={'Comparaison '+(i+1)} className={field} value={condition.operator}
        onChange={e=>changeCondition(name,i,{operator:e.target.value as LogicOperator})}>
        {operators.map(op=><option key={op.value} value={op.value}>{op.label}</option>)}
       </select>
      </label>
      {!noValue&&<label className="block space-y-1 text-[11px] font-semibold text-[#607762]">Valeur
       {choice?<select aria-label={'Valeur condition '+(i+1)} className={field} value={condition.value??''}
         onChange={e=>changeCondition(name,i,{value:e.target.value})}>
        {source!.options.map(option=><option key={option.id} value={option.value}>{option.label}</option>)}
       </select>:<input aria-label={'Valeur condition '+(i+1)} className={field} value={condition.value??''}
         onChange={e=>changeCondition(name,i,{value:e.target.value})} placeholder="Valeur de comparaison"/>}
      </label>}
      <button type="button" aria-label={'Supprimer condition '+(i+1)} className="flex items-center gap-1 text-[11px] font-semibold text-[#a05c53]"
       onClick={()=>group.conditions.length===1?setLogic(name,undefined):updateGroup(name,{conditions:group.conditions.filter((_,j)=>i!==j)})}>
       <Trash2 size={12}/> Supprimer cette condition
      </button>
     </div>;
    })}
    <button type="button" className="flex items-center gap-2 text-xs font-semibold text-[#38734b]" onClick={()=>{
      const first=createCondition(name==='branch');if(first)updateGroup(name,{conditions:[...group.conditions,first]});
    }}><Plus size={14}/> Ajouter une condition</button>
    <button type="button" onClick={()=>setLogic(name,undefined)} className="block text-xs text-[#a35950] underline">Retirer toute la règle</button>
   </div>}
  </section>;
 }
 return <div className="space-y-4" aria-label="Logique conditionnelle">
  <div className="space-y-2">
   <div className="flex items-center gap-2 text-[#34694b]"><GitBranch size={19}/><h3 className="text-base font-bold">Logique conditionnelle</h3></div>
   <p className="text-xs leading-5 text-[#6b8271]">Question sélectionnée : <strong>{question.label.slice(0,90)}</strong></p>
  </div>
  {renderRules('visibility','Afficher ou masquer','Réagir aux réponses précédentes. Une question masquée ne sera pas demandée ni enregistrée.')}
  {question.type!=='statement'&&renderRules('requiredWhen','Rendre obligatoire si','Exiger la réponse seulement lorsque les conditions sont remplies. Décoche « Réponse obligatoire » dans Options pour un déclenchement exclusivement conditionnel.')}
  {question.type!=='statement'&&renderRules('branch','Rediriger après cette page','Si la règle correspond, sauter à une page suivante ou terminer. Les pages ignorées ne sont ni validées ni enregistrées.')}
  <p className="rounded-lg bg-[#edf5eb] p-3 text-xs leading-5 text-[#4b6e55]">Les références sont conservées entre versions publiées. Les retours arrière et réponses modifiées actualisent automatiquement le chemin.</p>
 </div>;
}
