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
 return <aside aria-label="Outils du formulaire" className={open?"fixed inset-x-3 top-20 z-40 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-2xl border border-[#e4eae1] bg-white p-3 shadow-xl lg:sticky lg:inset-auto lg:top-4 lg:max-h-none lg:overflow-visible lg:p-2.5 lg:shadow-none":"flex flex-row items-center justify-between rounded-2xl border border-[#e4eae1] bg-white p-2 lg:sticky lg:top-4 lg:flex-col"}>
   <div className={open?"mb-2 flex justify-end":"flex justify-start lg:mb-2 lg:justify-center"}><button type="button" onClick={onToggle} title={open?'Réduire les outils':'Afficher les outils'}
     aria-label={open?'Réduire le menu latéral':'Ouvrir le menu latéral'}
     aria-expanded={open} className="flex h-11 w-11 items-center justify-center rounded-lg text-[#3f654a] hover:bg-[#eef6ed]">
      {open?<PanelLeftClose size={19}/>:<PanelLeftOpen size={19}/>}
   </button></div>
   <nav aria-label="Outils" className={open?'grid grid-cols-3 gap-1':'flex flex-row items-center gap-1 lg:flex-col'}>
    {tools.map(t=><button key={t.mode} type="button" aria-pressed={mode===t.mode} aria-label={t.name} title={t.name}
      onClick={()=>onModeChange(t.mode)}
      className={`flex flex-col items-center gap-1 min-h-11 rounded-xl px-2 py-2.5 text-xs font-semibold transition ${mode===t.mode?'bg-[#e7f3e5] text-[#2f7549]':'text-[#43674d] hover:bg-[#f2f7f1]'}`}>
       <t.icon size={18}/>{open?t.name:null}
      </button>)}
   </nav>
   {open&&<div className="mt-4 border-t border-[#edf1eb] pt-4">
   {mode==='add'&&<div className="space-y-2">
     <h3 className="px-1 text-sm font-bold text-[#33583f]">Insérer dans le document</h3><p className="px-1 text-xs leading-5 text-[#607265]">À la position du curseur.</p>
     <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
      {questionTypes.map(type=><button type="button" key={type} disabled={!editable}
       onClick={()=>onAddQuestion(type)} className="flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[#375a42] hover:bg-[#edf7ea] disabled:opacity-35">
       <Plus size={15}/>{type==='statement'?'Paragraphe':questionTypeNames[type]}</button>)}
     </div>
   </div>}
   {mode==='settings'&&<div>
     {selected&&editable?<QuestionSettings question={selected} onUpdate={onQuestionUpdate}/>:
     <div className="rounded-xl bg-[#f7faf5] p-4 text-sm leading-6 text-[#607265]">
      <Settings2 size={20} className="mb-3"/>Clique dans une question pour modifier ses options.</div>}
   </div>}
   {mode==='pages'&&<div className="space-y-2">
     <h3 className="px-1 text-sm font-bold text-[#33583f]">Pages</h3>
     {pages.map((p,i)=><button type="button" key={p.id} aria-current={pageIndex===i?'page':undefined}
      onClick={()=>onPageIndex(i)}
      className={`w-full truncate rounded-xl px-3 py-3 text-left text-sm ${pageIndex===i?'bg-[#e6f1e5] font-semibold text-[#2c6a41]':'text-[#496a54] hover:bg-[#f3f7f1]'}`}>
      {i+1}. {p.title||'Page sans titre'}</button>)}
     {editable&&<button className="mt-2 flex w-full items-center gap-2 rounded-xl p-3 text-xs font-semibold text-[#468253] hover:bg-[#edf6ea]" onClick={onAddPage}><Plus size={16}/> Ajouter une page</button>}
     {editable&&pages.length>1&&<button onClick={onDeletePage} className="w-full rounded-lg px-3 py-2 text-left text-xs text-[#ad6d64]">Supprimer la page actuelle</button>}
   </div>}
   </div>}
  </aside>;
}
