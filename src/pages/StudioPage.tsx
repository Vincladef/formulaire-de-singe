import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, BarChart3, ArrowLeft, CheckCircle2, ChevronRight, CircleAlert, Copy, Eye, Files, LoaderCircle, MoreHorizontal, Plus, Save, Send, Settings2, Trash2, X, Palette, Ellipsis, FilePlus2 } from 'lucide-react';
import { getAccessToken } from '../authClient';
import type { FormDetail, FormSummary } from '../shared/formApi';
import { draftPayloadSchema, duplicateQuestion, makePage, makeQuestion, moveQuestionAt, questionTypes, questionTypeNames, type QuestionType, type StudioPageData, type StudioQuestion } from '../shared/studio';
import { QuestionCard } from '../components/studio/QuestionCard';
import { QuestionSettings } from '../components/studio/QuestionSettings';
import { StudioPreview } from '../components/studio/StudioPreview';
import { ThemePanel } from '../components/studio/ThemePanel';
import { defaultFormTheme, readFormTheme, type FormTheme } from '../shared/theme';

const cta='inline-flex items-center justify-center gap-2 rounded-xl bg-[#2f6546] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#254e38] disabled:cursor-not-allowed disabled:opacity-40';
const light='inline-flex items-center justify-center gap-2 rounded-xl border border-[#e0e8df] bg-white px-3.5 py-2.5 text-sm font-semibold text-[#51735b] transition hover:bg-[#f0f5ef] disabled:opacity-35';
type ApiResponse<T>={ok:true;data:T}|{ok:false;error:{code:string;message:string}};
async function request<T>(path:string,method='GET',body?:unknown):Promise<T>{
 const token=await getAccessToken();if(!token)throw new Error('Session expirée. Reconnecte-toi pour continuer.');
 const response=await fetch(path,{method,headers:{Authorization:`Bearer ${token}`,...(body!==undefined?{'Content-Type':'application/json'}:{})},
    ...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const payload=await response.json() as ApiResponse<T>;
 if(!payload.ok)throw new Error(payload.error.message || 'Opération impossible');
 return payload.data;
}
function countQuestions(pages:StudioPageData[]){return pages.reduce((sum,p)=>sum+p.questions.length,0);}
type SaveState='saved'|'pending'|'saving'|'error';
export function StudioPage(){
 const [items,setItems]=useState<FormSummary[]>([]);
 const [listBusy,setListBusy]=useState(true);
 const [detail,setDetail]=useState<FormDetail|null>(null);
 const [pages,setPages]=useState<StudioPageData[]>([]);
 const [pageIndex,setPageIndex]=useState(0);
 const [questionId,setQuestionId]=useState<string|null>(null);
 const [preview,setPreview]=useState(false);
 const [settingsTab,setSettingsTab]=useState<'question'|'appearance'>('question');
 const [theme,setTheme]=useState<FormTheme>({...defaultFormTheme});
 const [themeState,setThemeState]=useState<SaveState>('saved');
 const savedThemeRef=useRef('');
 const themeSavingRef=useRef(false);
 const liveThemeRef=useRef(theme);liveThemeRef.current=theme;
 const [saveState,setSaveState]=useState<SaveState>('saved');
 const [error,setError]=useState('');
 const [operation,setOperation]=useState(false);
 const [showArchived,setShowArchived]=useState(false);
 const revisionRef=useRef(0);const draftRef=useRef<string|null>(null);
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
     setDetail(form);const nextTheme=readFormTheme(form.theme);
     savedThemeRef.current=JSON.stringify(nextTheme);setTheme(nextTheme);setThemeState('saved');setSettingsTab('question');
     const draft=form.versions.find(v=>v.status==='draft');
     draftRef.current=draft?.id??null;revisionRef.current=draft?.revision??0;
     const next:StudioPageData[]=draft?.pages.map(p=>({id:p.id,title:p.title,description:p.description,
       questions:p.questions.map(q=>({id:q.id,type:q.type as QuestionType,label:q.label,description:q.description,required:q.required,settings:q.settings,options:q.options.map(o=>({id:o.id,value:o.value,label:o.label}))}))})) ?? [];
     savedRef.current=JSON.stringify(next);setPages(next.length?next:[makePage()]);setPageIndex(0);setQuestionId(null);setPreview(false);setSaveState('saved');
   }catch(e){setError(e instanceof Error?e.message:'Chargement impossible');}finally{setOperation(false);}
 }
 async function createForm(){
   const name=window.prompt('Titre du nouveau formulaire','Mon nouveau formulaire');if(!name?.trim())return;
   setOperation(true);setError('');try{const result=await request<{id:string}>('/api/forms','POST',{title:name.trim()});await refreshList();await openForm(result.id);}
   catch(e){setError(e instanceof Error?e.message:'Création impossible');}finally{setOperation(false);}
 }
 async function renameForm(){if(!detail)return;
   const name=window.prompt('Nouveau titre',detail.title);if(!name?.trim()||name.trim()===detail.title)return;
   setOperation(true);setError('');try{await request(`/api/forms/${detail.id}`,'PATCH',{title:name.trim()});setDetail({...detail,title:name.trim()});await refreshList();}
   catch(e){setError(e instanceof Error?e.message:'Renommage impossible');}finally{setOperation(false);}
 }
 async function performState(action:'archive'|'unarchive'|'delete',id=detail?.id){if(!id)return;
   const label=action==='delete'?'placer à la corbeille':action==='archive'?'archiver':'restaurer';
   if(!window.confirm(`Voulez-vous vraiment ${label} ce formulaire ?`))return;
   setOperation(true);setError('');try{await request(`/api/forms/${id}/state`,'POST',{action});await refreshList();
     if(action==='delete'||action==='archive'){setDetail(null);setPages([]);draftRef.current=null;}
     else await openForm(id);
   }catch(e){setError(e instanceof Error?e.message:'Action impossible');}finally{setOperation(false);}
 }
 async function duplicateForm(id=detail?.id){if(!id||!window.confirm('Créer une copie indépendante de ce formulaire ?'))return;
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
 const saveTheme=useCallback(async()=>{
   if(!detail || !editable || themeSavingRef.current || !activeIdRef.current)return;
   themeSavingRef.current=true;setThemeState('saving');
   try{
     while(activeIdRef.current===detail.id){
       const snapshot=JSON.stringify(liveThemeRef.current);
       if(snapshot===savedThemeRef.current)break;
       await request(`/api/forms/${detail.id}/theme`,'PATCH',liveThemeRef.current);
       if(activeIdRef.current!==detail.id)break;
       savedThemeRef.current=snapshot;
     }
     if(activeIdRef.current===detail.id)setThemeState('saved');
   }catch(e){if(activeIdRef.current===detail.id){setThemeState('error');setError(e instanceof Error?e.message:'Impossible de sauvegarder l’apparence.');}}
   finally{themeSavingRef.current=false;}
 },[detail,editable]);
 useEffect(()=>{
  if(!editable || JSON.stringify(theme)===savedThemeRef.current)return;
  const timeout=setTimeout(()=>{void saveTheme();},600);
  return()=>clearTimeout(timeout);
 },[editable,theme,saveTheme]);
 async function publishForm(){if(!detail||!editable||operation)return;
  if(!window.confirm('Publier cette version ? Elle sera figée et un nouveau brouillon sera créé.'))return;
  setOperation(true);try{
    await saveNow();
    await saveTheme();
    if(JSON.stringify(latestRef.current)!==savedRef.current || JSON.stringify(liveThemeRef.current)!==savedThemeRef.current)throw new Error('Enregistre les changements avant publication.');
    const result=await request<{draftId:string}>(`/api/forms/${detail.id}/publish`,'POST',
      {versionId:draftRef.current,expectedRevision:revisionRef.current});
    if(!result.draftId)throw new Error('Le serveur n’a pas créé le nouveau brouillon.');
    await refreshList();await openForm(detail.id);
  }catch(e){setError(e instanceof Error?e.message:'Publication impossible');}finally{setOperation(false);}
 }
 function updatePage(next:StudioPageData){setSaveState('pending');setPages(p=>p.map((it,i)=>i===pageIndex?next:it));}
 function updateQuestion(question:StudioQuestion){if(!page)return;updatePage({...page,questions:page.questions.map(q=>q.id===question.id?question:q)});}
 function addQuestion(type:QuestionType){if(!page)return;const next=makeQuestion(type);updatePage({...page,questions:[...page.questions,next]});setQuestionId(next.id);setSettingsTab('question');}
 function moveQuestion(from:number,to:number){if(!page||to<0||to>=page.questions.length)return;
   updatePage({...page,questions:moveQuestionAt(page.questions,from,to)});}
 function deleteQuestion(id:string){if(!page||!window.confirm('Supprimer cette question du brouillon ?'))return;
   updatePage({...page,questions:page.questions.filter(q=>q.id!==id)});if(questionId===id)setQuestionId(null);}
 function addPage(){setSaveState('pending');setPages(p=>[...p,makePage()]);setPageIndex(pages.length);setQuestionId(null);}
 function deletePage(){if(pages.length<2||!window.confirm('Supprimer cette page et toutes ses questions ?'))return;
   setSaveState('pending');setPages(p=>p.filter((_,i)=>i!==pageIndex));setPageIndex(0);setQuestionId(null);}
 const activeItems=items.filter(i=>showArchived?!!i.archivedAt:!i.archivedAt);
 return <main className="studio-shell min-h-[calc(100vh-90px)] px-4 py-7 text-[#2b4836] sm:px-7">
  <div className="mx-auto max-w-[1550px]">
   <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
     <div><Link to="/" className="mb-2 inline-flex items-center gap-2 text-xs font-medium text-[#8da08f]"><ArrowLeft size={14}/> Accueil</Link>
       <h1 className="font-display text-3xl font-extrabold tracking-[-.055em] sm:text-4xl">Le Studio<span className="text-[#8eaf8c]">.</span></h1>
       <p className="mt-1 text-sm text-[#8a9d8d]">Imagine, compose, publie.</p>
     </div>
     <div className="flex flex-wrap items-center gap-2">
       {detail&&<span role="status" aria-live="polite" className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium ${saveState==='error'?'bg-red-50 text-red-700':'bg-[#eaf2e7] text-[#5d8668]'}`}>
         {saveState==='saving'?<LoaderCircle size={14} className="animate-spin"/>:saveState==='error'?<CircleAlert size={14}/>:<CheckCircle2 size={14}/>}
         {{saved:themeState==='saved'?'Enregistré':'Apparence en cours…',saving:'Enregistrement…',pending:'Modifications en attente',error:'Sauvegarde échouée'}[saveState]}
       </span>}
       <button className={cta} disabled={operation} onClick={()=>void createForm()}><Plus size={16}/> Nouveau formulaire</button>
     </div>
   </div>
   {error&&<div role="alert" className="mb-5 flex items-start justify-between gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700"><span>{error}</span><button title="Fermer le message" onClick={()=>setError('')}><X size={16}/></button></div>}
   {operation&&<p className="mb-3 text-xs text-[#74927b]" role="status">Opération en cours…</p>}
   {!detail ? <div className="rounded-[25px] border border-[#e4ece1] bg-white p-5 sm:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Mes formulaires</h2><p className="mt-1 text-sm text-[#8ca08c]">Retrouve tes questionnaires, ou crée le premier.</p></div><button className={light} onClick={()=>setShowArchived(v=>!v)}><Archive size={15}/>{showArchived?'Voir les actifs':'Voir les archives'}</button></div>
      {listBusy?<p role="status" className="p-7 text-center text-[#91a393]">Chargement des formulaires…</p>:
       activeItems.length===0?<div className="py-16 text-center"><Files className="mx-auto text-[#9dbca0]" size={35}/><p className="mt-4 font-semibold">{showArchived?'Aucune archive':'Ton espace de création est prêt.'}</p><p className="mt-2 text-sm text-[#94a598]">{showArchived?'Tu n’as pas encore archivé de formulaire.':'Ajoute ton premier questionnaire en quelques clics.'}</p></div>:
       <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{activeItems.map(item=><div key={item.id} className="rounded-2xl border border-[#e8ede5] bg-[#fafcf9] p-5"><button className="w-full text-left" onClick={()=>void openForm(item.id)}><p className="text-[11px] font-bold uppercase tracking-widest text-[#91a895]">{item.published?'Publié · ':'Brouillon · '}{item.role}</p><h3 className="mt-2 line-clamp-2 text-lg font-bold text-[#36533f]">{item.title}</h3><p className="mt-2 text-xs text-[#9aa99d]">{new Date(item.updatedAt).toLocaleDateString('fr-FR')}</p></button><div className="mt-5 flex justify-between border-t border-[#e7ede5] pt-3"><button className="text-xs font-bold text-[#548166]" onClick={()=>void openForm(item.id)}>Ouvrir <ChevronRight className="inline" size={14}/></button><div className="flex gap-2"><Link className="text-xs font-bold text-[#4f8660]" to={`/studio/resultats/${item.id}`}>Résultats</Link><button title="Dupliquer" aria-label={`Dupliquer ${item.title}`} onClick={()=>void duplicateForm(item.id)}><Copy size={15}/></button><button title={showArchived?'Restaurer':'Archiver'} aria-label={`Archiver ou restaurer ${item.title}`} onClick={()=>void performState(showArchived?'unarchive':'archive',item.id)}><Archive size={15}/></button><button title="Corbeille" aria-label={`Supprimer ${item.title}`} onClick={()=>void performState('delete',item.id)}><Trash2 size={15} className="text-[#ba837a]"/></button></div></div></div>)}</div>}
    </div> : <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e3ebdf] bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3"><button title="Liste des formulaires" onClick={()=>{if((saveState!=='saved'||themeState!=='saved') && !window.confirm('Quitter sans confirmer l’enregistrement des dernières modifications ?'))return;setDetail(null);draftRef.current=null;}} className="rounded-lg p-1 text-[#6e8873] hover:bg-[#edf4ed]"><ArrowLeft size={19}/></button><div><h2 className="max-w-[330px] truncate font-bold">{detail.title}</h2><span className="text-xs text-[#8c9b8d]">{published?'Version publiée + brouillon':'Brouillon'} · {countQuestions(pages)} question(s)</span></div></div>
        <div className="flex flex-wrap items-center gap-2">{published&&<><Link className={light} to={`/studio/resultats/${detail.id}`}><BarChart3 size={16}/> Résultats</Link><a className={light} target="_blank" rel="noopener noreferrer" href={`/f/${encodeURIComponent(detail.slug)}`}><Eye size={16}/> Voir le lien public</a><button className={light} onClick={()=>{void (async()=>{try{await navigator.clipboard.writeText(`${window.location.origin}/f/${encodeURIComponent(detail.slug)}`);}catch{setError("Copie impossible. Utilise le lien public.");}})();}}><Copy size={15}/> Copier le lien</button></>}<button className={light} onClick={()=>setPreview(v=>!v)}><Eye size={16}/>{preview?'Éditer':'Aperçu'}</button><details className="relative group/menu"><summary className={light+' list-none cursor-pointer'} aria-label="Plus d’actions"><Ellipsis size={18}/><span className="hidden sm:inline">Plus</span></summary><div className="absolute right-0 z-30 mt-2 min-w-44 rounded-2xl border border-[#e1e7df] bg-white p-2 shadow-xl"><button className="studio-mini-action w-full justify-start" disabled={!editable} onClick={()=>void renameForm()}>Renommer</button><button className="studio-mini-action w-full justify-start" onClick={()=>void duplicateForm()}><Copy size={15}/> Dupliquer</button></div></details><button className={cta} disabled={!editable||operation||saveState==='saving'||saveState==='error'||themeState==='saving'||themeState==='error'} onClick={()=>void publishForm()}><Send size={15}/> Publier</button></div>
      </div>
      {detail.archivedAt&&<p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Ce formulaire est archivé ; son contenu ne peut pas être modifié.</p>}
      {preview?<StudioPreview pages={pages} theme={theme}/>:<div className="grid items-start gap-4 lg:grid-cols-[225px_minmax(0,1fr)_285px] xl:grid-cols-[250px_minmax(0,1fr)_315px]">
        <aside aria-label="Pages du formulaire" className="rounded-[22px] border border-[#e4eae1] bg-white p-4 lg:sticky lg:top-5">
          <p className="mb-4 px-2 text-[11px] font-bold uppercase tracking-[.14em] text-[#98a899]">Navigation</p>
          <div className="space-y-1.5">{pages.map((p,i)=><button type="button" key={p.id} onClick={()=>{setPageIndex(i);setQuestionId(null);}} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${pageIndex===i?'bg-[#eaf3e9] text-[#366b49]':'text-[#738a78] hover:bg-[#f5f8f3]'}`}><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold ${pageIndex===i?'bg-[#d7e7d5]':'bg-[#f0f4ed]'}`}>{i+1}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold">{p.title||'Sans titre'}</span><span className="text-[11px] opacity-65">{p.questions.length} question(s)</span></span></button>)}</div>
          <button disabled={!editable} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#c8dbcb] px-3 py-3 text-sm font-semibold text-[#5d8c69] hover:bg-[#f5faf4] disabled:opacity-35" onClick={addPage}><Plus size={16}/> Ajouter une page</button>
          <div className="mt-6 border-t border-[#eef2eb] pt-5 text-xs text-[#9aaa9b]">{pages.length} page(s)<br/>{countQuestions(pages)} question(s)</div>
        </aside>
        <section aria-label="Éditeur de page" className="order-3 min-w-0 space-y-4 lg:order-2">
          {page&&<>
            <div className="rounded-[22px] border border-[#e4eae1] bg-white p-5 sm:p-7"><p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#83a18b]">PAGE {pageIndex+1}</p>
              <input aria-label="Titre de la page" className="mt-3 w-full bg-transparent text-2xl font-extrabold tracking-tight text-[#314a37] outline-none placeholder:text-[#aabbac]" placeholder="Titre de la page" value={page.title} disabled={!editable} onChange={e=>updatePage({...page,title:e.target.value})}/>
              <textarea aria-label="Description de la page" className="mt-3 w-full resize-y bg-transparent text-sm text-[#899b8d] outline-none placeholder:text-[#b2bdb2]" rows={2} placeholder="Une courte introduction (facultative)…" value={page.description??''} disabled={!editable} onChange={e=>updatePage({...page,description:e.target.value||null})}/>
              {pages.length>1&&<button disabled={!editable} className="text-xs font-semibold text-[#ba7c75]" onClick={deletePage}>Supprimer cette page</button>}
            </div>
            {editable&&<div className="studio-panel p-3"><div className="flex flex-wrap items-center gap-2"><span className="px-2 text-xs font-semibold text-[#768b7a]"><Plus size={14} className="mr-1 inline"/> Ajouter</span>{questionTypes.map(type=><button key={type} type="button" className="studio-mini-action hover:bg-[#e9f2e9]" onClick={()=>addQuestion(type)}>{questionTypeNames[type]}</button>)}</div></div>}
            {page.questions.map((q,i)=><QuestionCard key={q.id} index={i} question={q} selected={questionId===q.id} onSelect={()=>{setQuestionId(q.id);setSettingsTab('question');}} onUpdate={updateQuestion} onMove={d=>moveQuestion(i,i+d)} onDrop={from=>moveQuestion(from,i)} onDuplicate={()=>{const next=duplicateQuestion(q);const questions=[...page.questions];questions.splice(i+1,0,next);updatePage({...page,questions});setQuestionId(next.id);}} onDelete={()=>deleteQuestion(q.id)} readOnly={!editable}/>)}
            {page.questions.length===0&&<div className="rounded-[22px] border border-dashed border-[#d8e5d8] bg-white px-6 py-12 text-center"><FilePlus2 className="mx-auto text-[#9fbd9f]" size={30}/><p className="mt-4 font-semibold text-[#53715a]">Tout commence par une question.</p><p className="mt-2 text-sm text-[#9dab9e]">Choisis un type ci-dessous pour composer ta page.</p></div>}

          </>}
        </section>
        <aside className="studio-panel order-2 p-4 lg:order-3 lg:sticky lg:top-5 lg:p-5"><div className="mb-5 flex items-center gap-2"><Settings2 size={18} className="text-[#648b6d]"/><h2 className="font-bold">Réglages</h2></div>
          <div role="group" aria-label="Panneau de personnalisation" className="mb-5 grid grid-cols-2 rounded-xl bg-[#f1f5ef] p-1">
           <button type="button" aria-pressed={settingsTab==='question'} onClick={()=>setSettingsTab('question')} className={`rounded-lg px-2 py-2 text-xs font-semibold ${settingsTab==='question'?'bg-white text-[#29513a] shadow-sm':'text-[#758878]'}`}><Settings2 size={14} className="mr-1 inline"/> Question</button>
           <button type="button" aria-pressed={settingsTab==='appearance'} onClick={()=>setSettingsTab('appearance')} className={`rounded-lg px-2 py-2 text-xs font-semibold ${settingsTab==='appearance'?'bg-white text-[#29513a] shadow-sm':'text-[#758878]'}`}><Palette size={14} className="mr-1 inline"/> Apparence</button>
          </div>
          {settingsTab==='appearance'?<ThemePanel theme={theme} disabled={!editable} onChange={next=>{setTheme(next);setThemeState('pending');}}/>:selected&&editable?<QuestionSettings question={selected} onUpdate={updateQuestion}/>:<div className="space-y-3 rounded-xl bg-[#f6f9f5] p-5 text-sm leading-6 text-[#8b9c8e]"><MoreHorizontal size={22} className="text-[#94b29b]"/><p>Sélectionne une question pour personnaliser son contenu et ses options.</p></div>}
          <div className="mt-7 border-t border-[#eaf0e9] pt-5"><button className={light+' w-full'} disabled={!editable||saveState==='saving'||themeState==='saving'} onClick={()=>{void saveNow();void saveTheme();}}><Save size={15}/> Enregistrer maintenant</button>
          <button className="mt-3 inline-flex w-full items-center justify-center gap-2 text-xs font-semibold text-[#9b7b72]" onClick={()=>void performState('archive')}><Archive size={13}/> Archiver le formulaire</button>
          </div>
        </aside>
      </div>}
    </>}
  </div>
 </main>;
}
