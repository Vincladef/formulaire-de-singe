import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, ArrowLeft, CheckCircle2, CircleAlert, Clock3, Copy, Eye, FilePlus2, Files, LoaderCircle, Plus, Save, Send, X } from 'lucide-react';
import { getAccessToken } from '../authClient';
import type { FormDetail, FormSummary } from '../shared/formApi';
import { draftPayloadSchema, duplicateQuestion, makePage, moveQuestionAt, type QuestionType, type StudioPageData, type StudioQuestion } from '../shared/studio';
import { insertAtAnchor, type EditorAnchor } from '../shared/documentEditor';
import { QuestionCard } from '../components/studio/QuestionCard';
import { StudioSidebar, type SidebarMode } from '../components/studio/StudioSidebar';
import { ResultsPanel } from '../components/studio/ResultsPanel';
import { StudioPreview } from '../components/studio/StudioPreview';
import { GoogleSheetsPanel } from '../components/studio/GoogleSheetsPanel';
import { FormItemMenu } from '../components/studio/FormItemMenu';
import { StudioDialog, type StudioDialogIntent } from '../components/studio/StudioDialog';

const cta='inline-flex items-center justify-center gap-2 rounded-xl bg-[#2f6546] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#254e38] disabled:cursor-not-allowed disabled:opacity-40';
const light='inline-flex items-center justify-center gap-2 rounded-xl border border-[#e0e8df] bg-white px-3.5 py-2.5 text-sm font-semibold text-[#51735b] transition hover:bg-[#f0f5ef] disabled:opacity-35';
type ApiResponse<T>={ok:true;data:T}|{ok:false;error:{code:string;message:string}};
async function request<T>(path:string,method='GET',body?:unknown):Promise<T>{
 const token=await getAccessToken();if(!token)throw new Error('Impossible de récupérer le jeton de connexion. Utilise « Se déconnecter » en haut de page, puis reconnecte-toi.');
 const response=await fetch(path,{method,headers:{Authorization:`Bearer ${token}`,...(body!==undefined?{'Content-Type':'application/json'}:{})},
    ...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const payload=await response.json() as ApiResponse<T>;
 if(!payload.ok)throw new Error(payload.error.message || 'Opération impossible');
 return payload.data;
}
function countQuestions(pages:StudioPageData[]){return pages.reduce((sum,p)=>sum+p.questions.filter(q=>q.type!=='statement').length,0);}
type SaveState='saved'|'pending'|'saving'|'error';
export function StudioPage(){
 const [items,setItems]=useState<FormSummary[]>([]);
 const [listBusy,setListBusy]=useState(true);
 const [detail,setDetail]=useState<FormDetail|null>(null);
 const [pages,setPages]=useState<StudioPageData[]>([]);
 const [pageIndex,setPageIndex]=useState(0);
 const [questionId,setQuestionId]=useState<string|null>(null);
 const [preview,setPreview]=useState(false);
 const [activeTab,setActiveTab]=useState<'questions'|'results'|'integrations'|'settings'>('questions');
 const [sideMode,setSideMode]=useState<SidebarMode>('add');
 const [sidebarOpen,setSidebarOpen]=useState(false);
 const [saveState,setSaveState]=useState<SaveState>('saved');
 const [error,setError]=useState('');
 const [operation,setOperation]=useState(false);
 const [showArchived,setShowArchived]=useState(false);
 const [dialog,setDialog]=useState<StudioDialogIntent|null>(null);
 const dialogResolver=useRef<((answer:string|null)=>void)|null>(null);
 function askDialog(intent:StudioDialogIntent):Promise<string|null>{return new Promise(resolve=>{dialogResolver.current?.(null);dialogResolver.current=resolve;setDialog(intent);});}
 function resolveDialog(answer:string|null){dialogResolver.current?.(answer);dialogResolver.current=null;setDialog(null);}
 const revisionRef=useRef(0);const draftRef=useRef<string|null>(null);
 const cursorRef=useRef<EditorAnchor|null>(null);
 const savedRef=useRef('');const latestRef=useRef<StudioPageData[]>([]);const savingRef=useRef(false);
 const page=pages[pageIndex];const selected=page?.questions.find(q=>q.id===questionId)??null;
 const published=detail?.versions.some(v=>v.status==='published')??false;
 const editable=!!detail && !detail.archivedAt && detail.role!=='viewer' && !!draftRef.current;
 latestRef.current=pages;

 const refreshList=useCallback(async()=>{const list=await request<FormSummary[]>('/api/forms?limit=100');setItems(list);},[]);
 useEffect(()=>{let active=true;request<FormSummary[]>('/api/forms?limit=100').then(list=>{if(active)setItems(list);})
   .catch(e=>{if(active)setError(String(e instanceof Error?e.message:e));}).finally(()=>{if(active)setListBusy(false);});
   return()=>{active=false;};},[]);

 async function openForm(id:string){
   setOperation(true);setError('');
   try{
     const form=await request<FormDetail>(`/api/forms/${id}`);
     setDetail(form);const draft=form.versions.find(v=>v.status==='draft');
     draftRef.current=draft?.id??null;revisionRef.current=draft?.revision??0;
     const next:StudioPageData[]=draft?.pages.map(p=>({id:p.id,title:p.title,description:p.description,
       questions:p.questions.map(q=>({id:q.id,type:q.type as QuestionType,label:q.label,description:q.description,required:q.required,settings:q.settings,options:q.options.map(o=>({id:o.id,value:o.value,label:o.label}))}))})) ?? [];
     savedRef.current=JSON.stringify(next);setPages(next.length?next:[makePage()]);setPageIndex(0);setQuestionId(null);cursorRef.current=null;setPreview(false);setActiveTab('questions');setSideMode('add');setSaveState('saved');
   }catch(e){setError(e instanceof Error?e.message:'Chargement impossible');}finally{setOperation(false);}
 }
 async function createForm(){
   const name=await askDialog({kind:'text',title:'Nouveau formulaire',description:'Donne un nom à ton questionnaire. Tu pourras le modifier ensuite.',initialValue:'Mon nouveau formulaire',confirmLabel:'Créer'});if(!name?.trim())return;
   setOperation(true);setError('');try{const result=await request<{id:string}>('/api/forms','POST',{title:name.trim()});await refreshList();await openForm(result.id);}
   catch(e){setError(e instanceof Error?e.message:'Création impossible');}finally{setOperation(false);}
 }
 async function renameForm(){if(!detail)return;
   const name=await askDialog({kind:'text',title:'Renommer le formulaire',initialValue:detail.title,confirmLabel:'Renommer'});if(!name?.trim()||name.trim()===detail.title)return;
   setOperation(true);setError('');try{await request(`/api/forms/${detail.id}`,'PATCH',{title:name.trim()});setDetail({...detail,title:name.trim()});await refreshList();}
   catch(e){setError(e instanceof Error?e.message:'Renommage impossible');}finally{setOperation(false);}
 }
 async function performState(action:'archive'|'unarchive'|'delete',id=detail?.id){if(!id)return;
   const label=action==='delete'?'placer à la corbeille':action==='archive'?'archiver':'restaurer';
   if(!(await askDialog({kind:'confirm',title:action==='delete'?'Mettre à la corbeille ?':action==='archive'?'Archiver le formulaire ?':'Restaurer le formulaire ?',description:`Veux-tu ${label} ce formulaire ?`,confirmLabel:action==='delete'?'Mettre à la corbeille':action==='archive'?'Archiver':'Restaurer',danger:action==='delete'})))return;
   setOperation(true);setError('');try{await request(`/api/forms/${id}/state`,'POST',{action});await refreshList();
     if(action==='delete'||action==='archive'){setDetail(null);setPages([]);draftRef.current=null;}
     else await openForm(id);
   }catch(e){setError(e instanceof Error?e.message:'Action impossible');}finally{setOperation(false);}
 }
 async function duplicateForm(id=detail?.id){if(!id||!(await askDialog({kind:'confirm',title:'Dupliquer le formulaire ?',description:'Une copie indépendante sera créée ; le questionnaire original restera intact.',confirmLabel:'Dupliquer'})))return;
  setOperation(true);setError('');try{const result=await request<{id:string}>(`/api/forms/${id}/duplicate`,'POST');await refreshList();await openForm(result.id);}
  catch(e){setError(e instanceof Error?e.message:'Duplication impossible');}finally{setOperation(false);}
 }
 const activeIdRef=useRef<string|null>(null);
 activeIdRef.current=detail?.id??null;
 const saveNow=useCallback(async()=>{
   if(!detail||!draftRef.current||detail.archivedAt||detail.role==='viewer'||savingRef.current)return;
   savingRef.current=true;setSaveState('saving');setError('');
   try{
     // If the user edits during an HTTP request, immediately save the newest snapshot
     // after the preceding request completes, with the updated revision.
     while(activeIdRef.current===detail.id){
       const snapshot=JSON.stringify(latestRef.current);
       if(snapshot===savedRef.current)break;
       const payload={versionId:draftRef.current!,expectedRevision:revisionRef.current,pages:latestRef.current};
       const parsed=draftPayloadSchema.safeParse(payload);
       if(!parsed.success)throw new Error(parsed.error.issues[0]?.message??'Question invalide');
       const response=await request<{revision:number}>(`/api/forms/${detail.id}/draft`,'PUT',parsed.data);
       if(activeIdRef.current!==detail.id)break;
       revisionRef.current=response.revision;savedRef.current=snapshot;
     }
     if(activeIdRef.current===detail.id)setSaveState('saved');
   }catch(e){if(activeIdRef.current===detail.id){setSaveState('error');setError(e instanceof Error?e.message:'Sauvegarde impossible');}}
   finally{savingRef.current=false;}
 },[detail]);
 useEffect(()=>{
   if(!editable||JSON.stringify(pages)===savedRef.current)return;
   const t=setTimeout(()=>{void saveNow();},850);return()=>clearTimeout(t);
 },[pages,editable,saveNow]);
 async function publishForm(){if(!detail||!editable||operation)return;
  if(!(await askDialog({kind:'confirm',title:'Publier ce formulaire ?',description:'La version publiée sera figée ; un nouveau brouillon sera créé pour les prochaines modifications.',confirmLabel:'Publier'})))return;
  setOperation(true);try{
    await saveNow();
    if(JSON.stringify(latestRef.current)!==savedRef.current)throw new Error('Enregistre les changements avant publication.');
    const result=await request<{draftId:string}>(`/api/forms/${detail.id}/publish`,'POST',
      {versionId:draftRef.current,expectedRevision:revisionRef.current});
    if(!result.draftId)throw new Error('Le serveur n’a pas créé le nouveau brouillon.');
    await refreshList();await openForm(detail.id);
  }catch(e){setError(e instanceof Error?e.message:'Publication impossible');}finally{setOperation(false);}
 }
 function updatePage(next:StudioPageData){setSaveState('pending');setPages(p=>p.map((it,i)=>i===pageIndex?next:it));}
 function updateQuestion(question:StudioQuestion){
  setSaveState('pending');
  setPages(prev=>prev.map((p,i)=>i===pageIndex?{...p,questions:p.questions.map(q=>q.id===question.id?question:q)}:p));
 }
 function addQuestion(type:QuestionType, at?:EditorAnchor|null){
  if(!page)return;
  const anchor=at===undefined?cursorRef.current:at;
  const id=crypto.randomUUID();
  setSaveState('pending');
  setPages(prev=>prev.map((p,i)=>i===pageIndex?{...p,questions:insertAtAnchor(p.questions,type,anchor,id).questions}:p));
  // Keep the editing position after choosing a type in the menu or sidebar.
  cursorRef.current={questionId:id};setQuestionId(id);setSideMode('settings');
  requestAnimationFrame(()=>document.querySelector<HTMLTextAreaElement>(`[data-question-id="${id}"] textarea`)?.focus());
 }
 function moveQuestion(from:number,to:number){if(!page||to<0||to>=page.questions.length)return;
   updatePage({...page,questions:moveQuestionAt(page.questions,from,to)});}
 async function deleteQuestion(id:string){if(!page||!(await askDialog({kind:'confirm',title:'Supprimer cette question ?',description:'La question sera retirée du brouillon ; les versions déjà publiées resteront intactes.',confirmLabel:'Supprimer',danger:true})))return;
   setSaveState('pending');setPages(prev=>prev.map((p,i)=>i===pageIndex?{...p,questions:p.questions.filter(q=>q.id!==id)}:p));if(questionId===id)setQuestionId(null);}
 function addPage(){setSaveState('pending');setPages(p=>[...p,makePage()]);setPageIndex(pages.length);setQuestionId(null);}
 async function deletePage(){if(pages.length<2||!(await askDialog({kind:'confirm',title:'Supprimer cette page ?',description:'La page et toutes ses questions seront retirées du brouillon.',confirmLabel:'Supprimer la page',danger:true})))return;
   setSaveState('pending');setPages(p=>p.filter((_,i)=>i!==pageIndex));setPageIndex(0);setQuestionId(null);}
 const activeItems=items.filter(i=>showArchived?!!i.archivedAt:!i.archivedAt);
 return <main className="min-h-[calc(100vh-90px)] bg-[#f6f8f4] px-4 py-7 text-[#2b4836] sm:px-7">
  <div className="mx-auto max-w-[1550px]">
   {!detail&&<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
    <h1 className="font-display text-3xl font-bold tracking-tight text-[#244835] sm:text-4xl">Mes formulaires</h1>
    <button className={cta} disabled={operation} onClick={()=>void createForm()}><Plus size={17}/> Nouveau formulaire</button>
   </div>}
   {new URLSearchParams(window.location.search).get('google')==='connected'&&<p className="mb-4 rounded-xl bg-[#e8f5e8] p-3 text-sm text-[#31764b]">Compte Google connecté. Ouvre ton formulaire, puis son onglet Intégrations pour consulter la feuille.</p>}
   {new URLSearchParams(window.location.search).get('google')==='error'&&<p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">La connexion Google n’a pas abouti. Réessaie depuis l’onglet Intégrations.</p>}
   {error&&<div role="alert" className="mb-5 flex items-start justify-between gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700"><span>{error}</span><button title="Fermer le message" onClick={()=>setError('')}><X size={16}/></button></div>}
   {operation&&<p className="mb-3 text-xs text-[#607265]" role="status">Opération en cours…</p>}
   {!detail ? <section aria-label="Mes formulaires" className="rounded-2xl border border-[#e1e9de] bg-white px-4 py-3 sm:px-6">
     <div className="flex items-center justify-end py-2"><button className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-[#3f6049] hover:bg-[#eef5ed]" onClick={()=>setShowArchived(v=>!v)}>
      <Archive size={16}/>{showArchived?'Revenir aux formulaires':'Archives'}
     </button></div>
     {listBusy?<p role="status" className="py-12 text-center text-[#607265]">Chargement des formulaires…</p>:
       activeItems.length===0?<div className="py-14 text-center"><Files className="mx-auto text-[#638d6e]" size={34}/><p className="mt-3 font-semibold text-[#36583e]">{showArchived?'Aucune archive':'Aucun formulaire pour le moment'}</p><p className="mt-2 text-sm text-[#607265]">{showArchived?'Les formulaires archivés apparaîtront ici.':'Crée ton premier questionnaire avec le bouton en haut.'}</p></div>:
       <div className="divide-y divide-[#e5ece3]">{activeItems.map(item=>
        <div key={item.id} className="flex items-center gap-2 py-1">
         <button type="button" onClick={()=>void openForm(item.id)} className="flex min-h-20 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 text-left hover:bg-[#f3f8f2] focus-visible:outline-2 focus-visible:outline-[#37784b] sm:px-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e9f2e7] text-[#3c7650]"><Files size={20}/></span>
          <span className="min-w-0 flex-1">
           <span className="block truncate text-base font-semibold text-[#284b36]">{item.title}</span>
           <span className="mt-1 block text-xs text-[#607265]">{item.published?'Publié':'Brouillon'} · Modifié le {new Date(item.updatedAt).toLocaleDateString('fr-FR')}</span>
          </span>
         </button>
         <FormItemMenu title={item.title} archived={showArchived} onDuplicate={()=>void duplicateForm(item.id)}
          onArchive={()=>void performState(showArchived?'unarchive':'archive',item.id)}
          onDelete={()=>void performState('delete',item.id)}/>
        </div>)}</div>}
    </section> : <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e3ebdf] bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3"><button title="Liste des formulaires" onClick={()=>void (async()=>{if(saveState!=='saved' && !(await askDialog({kind:'confirm',title:'Quitter l’éditeur ?',description:'Les modifications récentes ne sont pas encore confirmées comme enregistrées.',confirmLabel:'Quitter'})))return;setDetail(null);draftRef.current=null;})()} aria-label="Revenir aux formulaires" className="flex h-11 w-11 items-center justify-center rounded-lg text-[#41674e] hover:bg-[#edf4ed]"><ArrowLeft size={19}/></button><div><h1 className="max-w-[330px] truncate font-bold text-[#294936]">{detail.title}</h1><span className="text-xs text-[#607265]">{published?'Version publiée + brouillon':'Brouillon'} · {countQuestions(pages)} question(s)</span></div></div>
        <div className="flex flex-wrap items-center gap-2">{detail&&<span role="status" aria-live="polite" className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium ${saveState==='error'?'bg-red-50 text-red-700':saveState==='pending'?'bg-[#fff6e5] text-[#825e2b]':saveState==='saving'?'bg-[#edf2ec] text-[#506957]':'bg-[#eaf2e7] text-[#315c42]'}`}>
         {saveState==='saving'?<LoaderCircle size={14} className="animate-spin"/>:saveState==='error'?<CircleAlert size={14}/>:saveState==='pending'?<Clock3 size={14}/>:<CheckCircle2 size={14}/>}
         {{saved:'Enregistré',saving:'Enregistrement…',pending:'Non enregistré',error:'Sauvegarde échouée'}[saveState]}
       </span>}{published&&<><a className={light} target="_blank" rel="noopener noreferrer" href={`/f/${encodeURIComponent(detail.slug)}`}><Eye size={16}/> Voir le lien public</a><button className={light} onClick={()=>{void (async()=>{try{await navigator.clipboard.writeText(`${window.location.origin}/f/${encodeURIComponent(detail.slug)}`);}catch{setError("Copie impossible. Utilise le lien public.");}})();}}><Copy size={15}/> Copier le lien</button></>}<button className={light} onClick={()=>{setActiveTab('questions');setPreview(v=>!v);}}><Eye size={16}/>{preview?'Éditer':'Aperçu'}</button><button className={cta} disabled={!editable||operation||saveState==='saving'||saveState==='error'} onClick={()=>void publishForm()}><Send size={15}/> Publier</button></div>
      </div>
      <nav aria-label="Sections du formulaire" className="mb-5 flex gap-2 border-b border-[#dfe8dc] pb-2">
        {(['questions','results','integrations','settings'] as const).map(tab=><button key={tab} type="button"
         aria-current={activeTab===tab?'page':undefined} onClick={()=>{setPreview(false);setActiveTab(tab);}}
         className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${activeTab===tab?'bg-[#e2f0e0] text-[#2d7246]':'text-[#47674e] hover:bg-[#eef5ed]'}`}>
          {{questions:'Éditeur',results:'Résultats',integrations:'Intégrations',settings:'Paramètres'}[tab]}
        </button>)}
       </nav>
       {detail.archivedAt&&<p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Ce formulaire est archivé ; son contenu ne peut pas être modifié.</p>}
      {activeTab==='results'?<ResultsPanel formId={detail.id}/>:
       activeTab==='integrations'?<GoogleSheetsPanel formId={detail.id} owner={detail.role==='owner'}/>:
       activeTab==='settings'?<section className="max-w-xl space-y-4 rounded-2xl border border-[#e2eade] bg-white p-6">
        <h2 className="text-xl font-bold text-[#31553c]">Paramètres du formulaire</h2>
        <p className="text-sm text-[#607265]">Nom : {detail.title}</p>
        <a className="block break-all text-sm font-medium text-[#315e40] underline underline-offset-4" target="_blank" rel="noopener noreferrer" href={`/f/${encodeURIComponent(detail.slug)}`}>Ouvrir le formulaire public</a>
        <div className="flex flex-wrap gap-2">
         <button className={light} disabled={!editable} onClick={()=>void renameForm()}>Renommer</button>
         <button className={light} onClick={()=>void duplicateForm()}><Copy size={15}/> Dupliquer</button>
         <button className={light} disabled={!editable||saveState==='saving'} onClick={()=>void saveNow()}><Save size={15}/> Enregistrer</button>
        </div>
        {editable&&<button className="inline-flex items-center gap-2 text-sm text-[#954840]" onClick={()=>void performState('archive')}><Archive size={15}/> Archiver</button>}
       </section>:
       preview?<StudioPreview pages={pages} title={detail.title}/>:<div className={`grid items-start gap-4 ${sidebarOpen?'lg:grid-cols-[255px_minmax(0,1fr)]':'lg:grid-cols-[70px_minmax(0,1fr)]'}`}>
        <StudioSidebar mode={sideMode} onModeChange={mode=>{setSideMode(mode);setSidebarOpen(true);}} open={sidebarOpen} onToggle={()=>setSidebarOpen(v=>!v)} pages={pages} pageIndex={pageIndex}
          onPageIndex={idx=>{setPageIndex(idx);setQuestionId(null);cursorRef.current=null;}}
          selected={selected} editable={editable} onQuestionUpdate={updateQuestion}
          onAddQuestion={addQuestion} onAddPage={addPage} onDeletePage={deletePage}/>
        <section aria-label="Éditeur de page" className="min-w-0 rounded-[22px] border border-[#e4eae1] bg-white px-4 py-6 sm:px-10 sm:py-10">
          {page&&<>
            <div className="mb-7 border-b border-[#eff2ee] pb-5"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold tracking-wide text-[#607265]">PAGE {pageIndex+1}</p>
                {pages.length===1&&editable&&<button type="button" onClick={addPage} className="inline-flex items-center gap-1 rounded-lg border border-[#d7e6d7] px-3 py-2 text-xs font-semibold text-[#417353] hover:bg-[#edf5ec]"><Plus size={14}/> Ajouter une page</button>}
              </div>
              <input aria-label="Titre de la page" className="mt-3 w-full bg-transparent text-3xl font-extrabold tracking-tight text-[#314a37] outline-none placeholder:text-[#607265]" placeholder="Titre de la page" value={page.title} disabled={!editable} onChange={e=>updatePage({...page,title:e.target.value})}/>
              <textarea aria-label="Description de la page" className="mt-3 w-full resize-y bg-transparent text-sm text-[#607265] outline-none placeholder:text-[#607265]" rows={2} placeholder="Une courte introduction (facultative)…" value={page.description??''} disabled={!editable} onChange={e=>updatePage({...page,description:e.target.value||null})}/>
              {pages.length>1&&<button disabled={!editable} className="text-xs font-semibold text-[#ba7c75]" onClick={()=>void deletePage()}>Supprimer cette page</button>}
            </div>
            {page.questions.map((q,i)=><QuestionCard key={q.id} index={i} questionNumber={page.questions.slice(0,i+1).filter(item=>item.type!=='statement').length} question={q} selected={questionId===q.id}
 onSelect={()=>{setQuestionId(q.id);setSideMode('settings');cursorRef.current={questionId:q.id};}}
 onCursor={(offset,text)=>{cursorRef.current={questionId:q.id,offset,text};}}
 onInsert={(type,offset,text)=>addQuestion(type,{questionId:q.id,offset,text})}
 onUpdate={updateQuestion} onMove={d=>moveQuestion(i,i+d)} onDrop={from=>moveQuestion(from,i)}
 onDuplicate={()=>{const next=duplicateQuestion(q);const questions=[...page.questions];questions.splice(i+1,0,next);updatePage({...page,questions});setQuestionId(next.id);}}
 onDelete={()=>void deleteQuestion(q.id)} onOpenSettings={()=>{setQuestionId(q.id);setSideMode('settings');setSidebarOpen(true);}} readOnly={!editable}/>)}
            {page.questions.length===0&&<div className="rounded-[22px] border border-dashed border-[#d8e5d8] bg-white px-6 py-12 text-center"><FilePlus2 className="mx-auto text-[#607265]" size={30}/><p className="mt-4 font-semibold text-[#53715a]">Tout commence par une question.</p><p className="mt-2 text-sm text-[#607265]">Écris comme dans un document, puis utilise / pour insérer une question.</p><button type="button" onClick={()=>addQuestion('statement')} className="mt-4 rounded-xl bg-[#e9f3e8] px-4 py-2 text-sm font-semibold text-[#35764b]">Commencer à écrire</button></div>}
            {editable&&<button type="button" className="mt-6 flex w-full items-center gap-2 rounded-lg px-2 py-3 text-left text-sm text-[#607265] hover:bg-[#f5faf5]"
              onClick={()=>addQuestion('statement',null)}><Plus size={18}/> Écrire un paragraphe… <span className="ml-auto text-xs">Tape / pour les questions</span></button>}
          </>}
        </section>
      </div>}
    </>}
  </div>
   {dialog&&<StudioDialog intent={dialog} onResolve={resolveDialog}/>}
 </main>;
}
