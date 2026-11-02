import { Layers3,Plus,Settings2,SlidersHorizontal,PanelLeftClose,PanelLeftOpen } from 'lucide-react';
import { QuestionSettings } from './QuestionSettings';
import { questionTypes,questionTypeNames,type QuestionType,type StudioPageData,type StudioQuestion } from '../../shared/studio';

export type SidebarMode='add'|'settings'|'pages';
type Props={
 mode:SidebarMode;onModeChange:(mode:SidebarMode)=>void;open:boolean;onToggle:()=>void;
 pages:StudioPageData[];pageIndex:number;onPageIndex:(index:number)=>void;
 selected:StudioQuestion|null;editable:boolean;
 onQuestionUpdate:(q:StudioQuestion)=>void;onAddQuestion:(type:QuestionType)=>void;
 onAddPage:()=>void;onDeletePage:()=>void;
};
export function StudioSidebar({mode,onModeChange,open,onToggle,pages,pageIndex,onPageIndex,selected,editable,
 onQuestionUpdate,onAddQuestion,onAddPage,onDeletePage}:Props){
 const tools=[{mode:'add',name:'Ajouter',icon:Plus},{mode:'settings',name:'Options',icon:SlidersHorizontal},
 {mode:'pages',name:'Pages',icon:Layers3}] as const;
 return <aside aria-label="Outils du formulaire" className="rounded-2xl border border-[#e4eae1] bg-white p-2.5 lg:sticky lg:top-4">
   <div className="mb-2 flex justify-end"><button type="button" onClick={onToggle} title={open?'Réduire les outils':'Afficher les outils'}
     aria-label={open?'Réduire le menu latéral':'Ouvrir le menu latéral'}
     aria-expanded={open} className="rounded-lg p-2 text-[#63816a] hover:bg-[#eef6ed]">
      {open?<PanelLeftClose size={19}/>:<PanelLeftOpen size={19}/>}
   </button></div>
   <nav aria-label="Outils" className={open?'grid grid-cols-3 gap-1':'flex flex-col items-center gap-1'}>
    {tools.map(t=><button key={t.mode} type="button" aria-pressed={mode===t.mode}
      onClick={()=>onModeChange(t.mode)}
      className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-xs font-semibold transition ${mode===t.mode?'bg-[#e7f3e5] text-[#2f7549]':'text-[#6b8171] hover:bg-[#f2f7f1]'}`}>
       <t.icon size={18}/>{open?t.name:null}
      </button>)}
   </nav>
   {open&&<div className="mt-4 border-t border-[#edf1eb] pt-4">
   {mode==='add'&&<div className="space-y-2">
     <h3 className="px-1 text-sm font-bold text-[#33583f]">Ajouter une question</h3>
     <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
      {questionTypes.map(type=><button type="button" key={type} disabled={!editable}
       onClick={()=>onAddQuestion(type)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-[#4b7957] hover:bg-[#edf7ea] disabled:opacity-35">
       <Plus size={15}/>{questionTypeNames[type]}</button>)}
     </div>
   </div>}
   {mode==='settings'&&<div>
     {selected&&editable?<QuestionSettings question={selected} onUpdate={onQuestionUpdate}/>:
     <div className="rounded-xl bg-[#f7faf5] p-4 text-sm leading-6 text-[#829586]">
      <Settings2 size={20} className="mb-3"/>Clique dans une question pour modifier ses options.</div>}
   </div>}
   {mode==='pages'&&<div className="space-y-2">
     <h3 className="px-1 text-sm font-bold text-[#33583f]">Pages</h3>
     {pages.map((p,i)=><button type="button" key={p.id} aria-current={pageIndex===i?'page':undefined}
      onClick={()=>onPageIndex(i)}
      className={`w-full truncate rounded-xl px-3 py-3 text-left text-sm ${pageIndex===i?'bg-[#e6f1e5] font-semibold text-[#2c6a41]':'text-[#6a8070] hover:bg-[#f3f7f1]'}`}>
      {i+1}. {p.title||'Page sans titre'}</button>)}
     {editable&&<button className="mt-2 flex w-full items-center gap-2 rounded-xl p-3 text-xs font-semibold text-[#468253] hover:bg-[#edf6ea]" onClick={onAddPage}><Plus size={16}/> Ajouter une page</button>}
     {editable&&pages.length>1&&<button onClick={onDeletePage} className="w-full rounded-lg px-3 py-2 text-left text-xs text-[#ad6d64]">Supprimer la page actuelle</button>}
   </div>}
   </div>}
  </aside>;
}
