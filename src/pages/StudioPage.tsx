import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, ArrowLeft, BarChart3, CheckCircle2, ChevronRight, CircleAlert, Clock3, Copy, Eye, FileText, Files, Folder, GripVertical, LayoutDashboard, LoaderCircle, Plus, Search, Save, Send, X } from 'lucide-react';
import {formatParisDate,formatParisDateTime} from '../shared/presentation';
import { getAccessToken } from '../authClient';
import type { FormDetail, FormSummary } from '../shared/formApi';
import { draftPayloadSchema, makePage, type QuestionType, type StudioPageData, type StudioQuestion } from '../shared/studio';
import { DocumentCanvas, type DocumentCanvasHandle } from '../components/studio/DocumentCanvas';
import { StudioSidebar, type SidebarMode } from '../components/studio/StudioSidebar';
import { ResultsPanel } from '../components/studio/ResultsPanel';
import { GoogleSheetsPanel } from '../components/studio/GoogleSheetsPanel';
import { StudioPreview } from '../components/studio/StudioPreview';
import { FormItemMenu } from '../components/studio/FormItemMenu';
import { FolderSidebar, type FolderInfo } from '../components/studio/FolderSidebar';
import { FolderMoveDialog } from '../components/studio/FolderMoveDialog';
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
 const [activeTab,setActiveTab]=useState<'overview'|'questions'|'results'|'integrations'|'settings'>('questions');
 const [overviewResults,setOverviewResults]=useState<{total:number;submissions:Array<{id:string;submittedAt:string|null;answers:unknown[]}>}|null>(null);
 const [googleOutcome,setGoogleOutcome]=useState<'connected'|'error'|'verifying'|null>(null);
 const managedVerificationStarted=useRef(false);
 const [sideMode,setSideMode]=useState<SidebarMode>('add');
 const [sidebarOpen,setSidebarOpen]=useState(false);
 const [saveState,setSaveState]=useState<SaveState>('saved');
 const [error,setError]=useState('');
 const [operation,setOperation]=useState(false);
 const [showArchived,setShowArchived]=useState(false);
 const [folders,setFolders]=useState<FolderInfo[]>([]);
 const [selectedFolder,setSelectedFolder]=useState('all');
 const [searchTerm,setSearchTerm]=useState('');
 const [sortMode,setSortMode]=useState<'recent'|'name'>('recent');
 const searchRef=useRef<HTMLInputElement>(null);
 const [undoMove,setUndoMove]=useState<{kind:'form'|'folder';id:string;original:string|null;name:string}|null>(null);
 const [moveTarget,setMoveTarget]=useState<FormSummary|null>(null);
 const [dialog,setDialog]=useState<StudioDialogIntent|null>(null);
 const dialogResolver=useRef<((answer:string|null)=>void)|null>(null);
 function askDialog(intent:StudioDialogIntent):Promise<string|null>{return new Promise(resolve=>{dialogResolver.current?.(null);dialogResolver.current=resolve;setDialog(intent);});}
 function resolveDialog(answer:string|null){dialogResolver.current?.(answer);dialogResolver.current=null;setDialog(null);}
 const revisionRef=useRef(0);const draftRef=useRef<string|null>(null);
 const documentRef=useRef<DocumentCanvasHandle|null>(null);
 const savedRef=useRef('');const latestRef=useRef<StudioPageData[]>([]);const savingRef=useRef(false);
 const page=pages[pageIndex];const selected=page?.questions.find(q=>q.id===questionId)??null;
 const published=detail?.versions.some(v=>v.status==='published')??false;
 const editable=!!detail && !detail.archivedAt && detail.role!=='viewer' && !!draftRef.current;
 latestRef.current=pages;

 const refreshList=useCallback(async()=>{const list=await request<FormSummary[]>('/api/forms?limit=100');setItems(list);},[]);
 const refreshFolders=useCallback(async()=>{const list=await request<FolderInfo[]>('/api/folders');setFolders(list);},[]);
 useEffect(()=>{void refreshFolders().catch(e=>setError(e instanceof Error?e.message:'Dossiers indisponibles.'));},[refreshFolders]);
 useEffect(()=>{let active=true;request<FormSummary[]>('/api/forms?limit=100').then(list=>{if(active)setItems(list);})
   .catch(e=>{if(active)setError(String(e instanceof Error?e.message:e));}).finally(()=>{if(active)setListBusy(false);});
   return()=>{active=false;};},[]);

 const openForm=useCallback(async(id:string,tab?:'overview'|'questions'|'results'|'integrations'|'settings')=>{
   setOperation(true);setError('');
   try{
     const form=await request<FormDetail>(`/api/forms/${id}`);
     setDetail(form);const draft=form.versions.find(v=>v.status==='draft');
     draftRef.current=draft?.id??null;revisionRef.current=draft?.revision??0;
     const next:StudioPageData[]=draft?.pages.map(p=>({id:p.id,title:p.title,description:p.description,
       questions:p.questions.map(q=>({id:q.id,type:q.type as QuestionType,label:q.label,description:q.description,required:q.required,settings:q.settings,options:q.options.map(o=>({id:o.id,value:o.value,label:o.label}))}))})) ?? [];
     savedRef.current=JSON.stringify(next);setPages(next.length?next:[makePage()]);setPageIndex(0);setQuestionId(null);setPreview(false);setActiveTab(tab??(form.versions.some(v=>v.status==='published')?'overview':'questions'));setSideMode('add');setSaveState('saved');
   }catch(e){setError(e instanceof Error?e.message:'Chargement impossible');}finally{setOperation(false);}
 },[]);
 useEffect(()=>{
  const params=new URLSearchParams(window.location.search);
  const formId=params.get('google_form');
  const outcome=params.get('google');
  if(outcome==='verifying'){
   if(managedVerificationStarted.current)return;
   managedVerificationStarted.current=true;
   setGoogleOutcome('verifying');
   window.history.replaceState(window.history.state,'',window.location.pathname);
   void (async()=>{
    const confirmed=await request<{connected:true;formId:string}>('/api/integrations/google/composio/complete','POST');
    window.sessionStorage.removeItem('monk-google-pending-form');
    await openForm(confirmed.formId,'integrations');
    setGoogleOutcome('connected');
   })().catch(()=>{
    setGoogleOutcome('error');
    const pending=window.sessionStorage.getItem('monk-google-pending-form');
    if(pending&&/^[0-9a-f-]{36}$/i.test(pending))void openForm(pending,'integrations');
   });
   return;
  }
  if(!['connected','error'].includes(outcome??''))return;
  const resumeId=(formId&&/^[0-9a-f-]{36}$/i.test(formId))
   ?formId:window.sessionStorage.getItem('monk-google-pending-form');
  setGoogleOutcome(outcome as 'connected'|'error');
  window.sessionStorage.removeItem('monk-google-pending-form');
  window.history.replaceState(window.history.state,'',window.location.pathname);
  if(resumeId&&/^[0-9a-f-]{36}$/i.test(resumeId))void openForm(resumeId,'integrations');
 },[openForm]);
 useEffect(()=>{
  const onShortcut=(event:KeyboardEvent)=>{
   if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&!detail){
    event.preventDefault();searchRef.current?.focus();
   }
  };
  window.addEventListener('keydown',onShortcut);
  return()=>window.removeEventListener('keydown',onShortcut);
 },[detail]);
 useEffect(()=>{
  if(!detail||activeTab!=='overview')return;
  let active=true;setOverviewResults(null);
  void request<{total:number;submissions:Array<{id:string;submittedAt:string|null;answers:unknown[]}>}>(
   '/api/forms/'+detail.id+'/results?page=0&limit=5').then(x=>{if(active)setOverviewResults(x);}).catch(()=>{});
  return()=>{active=false;};
 },[detail,activeTab]);
 async function createForm(){
   const name=await askDialog({kind:'text',title:'Nouveau formulaire',description:'Donne un nom à ton questionnaire. Tu pourras le modifier ensuite.',initialValue:'Mon nouveau formulaire',confirmLabel:'Créer'});if(!name?.trim())return;
   setOperation(true);setError('');try{const result=await request<{id:string}>('/api/forms','POST',{title:name.trim()});
     if(selectedFolder!=='all'&&selectedFolder!=='uncategorized')await request(`/api/forms/${result.id}/folder`,'PATCH',{folderId:selectedFolder});
     await refreshList();await openForm(result.id);}
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
 function deleteQuestion(id:string){if(!page)return;
   setSaveState('pending');setPages(prev=>prev.map((p,i)=>i===pageIndex?{...p,questions:p.questions.filter(q=>q.id!==id)}:p));if(questionId===id)setQuestionId(null);}
 function addPage(){setSaveState('pending');setPages(p=>[...p,makePage()]);setPageIndex(pages.length);setQuestionId(null);}
 async function deletePage(){if(pages.length<2||!(await askDialog({kind:'confirm',title:'Supprimer cette page ?',description:'La page et toutes ses questions seront retirées du brouillon.',confirmLabel:'Supprimer la page',danger:true})))return;
   setSaveState('pending');setPages(p=>p.filter((_,i)=>i!==pageIndex));setPageIndex(0);setQuestionId(null);}
 async function createFolder(parentId:string|null=null){
  const name=await askDialog({kind:'text',title:parentId?'Nouveau sous-dossier':'Nouveau dossier',
   description:parentId?'Ce dossier sera créé à l’intérieur du dossier sélectionné.':'Crée un dossier pour ranger tes formulaires.',
   initialValue:'',confirmLabel:'Créer'});
  if(!name?.trim())return;
  setOperation(true);setError('');
  try{const created=await request<FolderInfo>('/api/folders','POST',{name:name.trim(),parentId});await refreshFolders();setSelectedFolder(created.id);}
  catch(e){setError(e instanceof Error?e.message:'Création du dossier impossible.');}
  finally{setOperation(false);}
 }
 async function renameFolder(folder:FolderInfo){
  const name=await askDialog({kind:'text',title:'Renommer le dossier',initialValue:folder.name,confirmLabel:'Renommer'});
  if(!name?.trim()||name.trim()===folder.name)return;
  setOperation(true);setError('');
  try{await request('/api/folders/'+folder.id,'PATCH',{name:name.trim()});await refreshFolders();}
  catch(e){setError(e instanceof Error?e.message:'Renommage impossible.');}
  finally{setOperation(false);}
 }
 async function deleteFolder(folder:FolderInfo){
  const answer=await askDialog({kind:'confirm',title:'Supprimer ce dossier ?',description:'Les formulaires seront conservés dans « Sans dossier » ; ses sous-dossiers resteront accessibles à la racine.',confirmLabel:'Supprimer le dossier',danger:true});
  if(!answer)return;
  setOperation(true);setError('');
  try{await request('/api/folders/'+folder.id,'DELETE');await Promise.all([refreshFolders(),refreshList()]);
    if(selectedFolder===folder.id)setSelectedFolder('uncategorized');
  }catch(e){setError(e instanceof Error?e.message:'Suppression du dossier impossible.');}
  finally{setOperation(false);}
 }
 async function moveForm(folderId:string|null,formId=moveTarget?.id){
  if(!formId||operation)return;
  const original=items.find(x=>x.id===formId);
  if(!original||original.role!=='owner')return;
  if((original.folderId??null)===folderId){setMoveTarget(null);return;}
  setOperation(true);setError('');
  try{
   await request('/api/forms/'+formId+'/folder','PATCH',{folderId});await refreshList();
   setUndoMove({kind:'form',id:formId,original:original.folderId??null,name:original.title});
   setMoveTarget(null);
  }catch(e){setError(e instanceof Error?e.message:'Déplacement impossible.');}
  finally{setOperation(false);}
 }
 async function moveFolderTree(folderId:string,parentId:string|null){
  if(operation||folderId===parentId)return;
  const folder=folders.find(f=>f.id===folderId);if(!folder)return;
  if((folder.parentId??null)===parentId)return;
  setOperation(true);setError('');
  try{
   await request('/api/folders/'+folderId+'/move','PATCH',{parentId});await refreshFolders();
   setUndoMove({kind:'folder',id:folderId,original:folder.parentId??null,name:folder.name});
  }catch(e){setError(e instanceof Error?e.message:'Impossible de déplacer ce dossier.');}
  finally{setOperation(false);}
 }
 async function undoLastMove(){
  if(!undoMove||operation)return;
  setOperation(true);setError('');
  try{
   if(undoMove.kind==='form'){await request('/api/forms/'+undoMove.id+'/folder','PATCH',{folderId:undoMove.original});await refreshList();}
   else{await request('/api/folders/'+undoMove.id+'/move','PATCH',{parentId:undoMove.original});await refreshFolders();}
   setUndoMove(null);
  }catch(e){setError(e instanceof Error?e.message:'Annulation impossible.');}
  finally{setOperation(false);}
 }
 const allVisibleItems=items.filter(i=>showArchived?!!i.archivedAt:!i.archivedAt);
 const folderCounts:Record<string,number>={uncategorized:0};
 for(const item of allVisibleItems){const id=item.folderId??'uncategorized';folderCounts[id]=(folderCounts[id]??0)+1;}
 const folderById=new Map(folders.map(f=>[f.id,f]));
 const folderPath:FolderInfo[]=[];
 if(folderById.has(selectedFolder)){
  let current=folderById.get(selectedFolder);const seen=new Set<string>();
  while(current&&!seen.has(current.id)){
   seen.add(current.id);folderPath.unshift(current);
   current=current.parentId?folderById.get(current.parentId):undefined;
  }
 }
 const searchNormalized=searchTerm.trim().toLocaleLowerCase('fr');
 const searchMatch=(item:FormSummary)=>{
  if(!searchNormalized)return false;
  let parent=item.folderId;const labels:string[]=[];const seen=new Set<string>();
  while(parent&&!seen.has(parent)){
   seen.add(parent);const folder=folderById.get(parent);
   if(!folder)break;labels.push(folder.name);parent=folder.parentId??null;
  }
  return [item.title,...labels].join(' ').toLocaleLowerCase('fr').includes(searchNormalized);
 };
 const sortedItems=[...allVisibleItems].sort((a,b)=>sortMode==='name'
  ?a.title.localeCompare(b.title,'fr')
  :new Date(b.updatedAt).getTime()-new Date(a.updatedAt).getTime());
 const activeItems=sortedItems.filter(i=>searchNormalized?searchMatch(i):
  selectedFolder==='all'||selectedFolder==='recent'||(selectedFolder==='uncategorized'?!i.folderId:i.folderId===selectedFolder))
  .slice(0,selectedFolder==='recent'&&!searchNormalized?15:undefined);
 const childFolders=!searchNormalized&&folderById.has(selectedFolder)?
  folders.filter(f=>(f.parentId??null)===selectedFolder).sort((a,b)=>a.name.localeCompare(b.name,'fr')):[];
 const folderTitle=searchNormalized?'Résultats de recherche':selectedFolder==='all'?'Tous les formulaires':
  selectedFolder==='recent'?'Récents':selectedFolder==='uncategorized'?'Sans dossier':
  folderById.get(selectedFolder)?.name??'Dossier';
 return <main className="min-h-[calc(100vh-90px)] bg-[#f6f8f4] px-4 py-7 text-[#2b4836] sm:px-7">
  <div className="mx-auto max-w-[1550px]">
   {!detail&&<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
    <h1 className="font-display text-3xl font-bold tracking-tight text-[#244835] sm:text-4xl">Mes formulaires</h1>
    <button className={cta} disabled={operation} onClick={()=>void createForm()}><Plus size={17}/> Nouveau formulaire</button>
   </div>}
   {error&&<div role="alert" className="mb-5 flex items-start justify-between gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700"><span>{error}</span><button title="Fermer le message" onClick={()=>setError('')}><X size={16}/></button></div>}
   {operation&&<p className="mb-3 text-xs text-[#607265]" role="status">Opération en cours…</p>}
   {undoMove&&!detail&&<div role="status" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d9e9d7] bg-[#ecf5ea] px-4 py-2.5 text-sm text-[#42684c]"><span>« {undoMove.name} » a été déplacé.</span><button type="button" disabled={operation} onClick={()=>void undoLastMove()} className="font-bold underline underline-offset-4 disabled:opacity-40">Annuler</button></div>}
   {!detail ? <div className="grid items-start gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
    <FolderSidebar folders={folders} selected={selectedFolder} formCounts={folderCounts} allCount={allVisibleItems.length}
     onSelect={setSelectedFolder} onCreate={()=>void createFolder(null)} onCreateChild={id=>void createFolder(id)}
     onRename={folder=>void renameFolder(folder)} onDelete={folder=>void deleteFolder(folder)}
     onMoveFolder={(id,parentId)=>void moveFolderTree(id,parentId)}
     onMoveForm={(id,folderId)=>void moveForm(folderId,id)}/>
    <section aria-label="Mes formulaires" className="min-w-0 rounded-2xl border border-[#e1e9de] bg-white px-4 py-3 sm:px-6">
     <div className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
       <button type="button" className="rounded-lg px-1.5 py-2 text-[#66816c] hover:bg-[#eff5ed]" onClick={()=>setSelectedFolder('all')}>Bibliothèque</button>
       <ChevronRight size={15} className="text-[#9aaa9c]"/>
       {folderPath.length>0?folderPath.map((folder,i)=><span key={folder.id} className="inline-flex min-w-0 items-center gap-1">
        <button type="button" onClick={()=>setSelectedFolder(folder.id)} className="max-w-44 truncate rounded-lg px-1.5 py-2 font-semibold text-[#31543d] hover:bg-[#edf5eb]">{folder.name}</button>
        {i<folderPath.length-1&&<ChevronRight size={15} className="text-[#9aaa9c]"/>}
       </span>):<h2 className="min-w-0 truncate px-1.5 text-base font-bold text-[#31543d]">{folderTitle}</h2>}
      </div>
      <button className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-[#3f6049] hover:bg-[#eef5ed]" onClick={()=>setShowArchived(v=>!v)}>
       <Archive size={16}/>{showArchived?'Afficher les formulaires':'Archives'}
      </button>
     </div>
     <div className="mb-3 mt-1 flex flex-wrap items-center gap-2">
      <label className="flex min-h-11 min-w-[190px] flex-1 items-center gap-2 rounded-xl border border-[#e3ebe1] bg-[#fafcf9] px-3 text-[#74907a] focus-within:border-[#8bb594] focus-within:ring-2 focus-within:ring-[#cbe5ce]">
       <Search size={17} className="shrink-0"/>
       <input ref={searchRef} value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} aria-label="Rechercher des formulaires et dossiers"
        placeholder="Rechercher un formulaire ou un dossier" className="min-w-0 flex-1 bg-transparent py-2 text-sm text-[#31533c] outline-none placeholder:text-[#99a99c]"/>
       <kbd className="hidden shrink-0 rounded-md border border-[#e3ebe0] bg-white px-1.5 py-0.5 text-[10px] text-[#849888] sm:block">Ctrl K</kbd>
      </label>
      <select aria-label="Trier les formulaires" value={sortMode} onChange={e=>setSortMode(e.target.value as 'recent'|'name')}
       className="min-h-11 rounded-xl border border-[#e3ebe1] bg-white px-3 text-xs font-semibold text-[#587360]">
       <option value="recent">Modifiés récemment</option><option value="name">Nom A-Z</option>
      </select>
     </div>
     {childFolders.length>0&&<div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {childFolders.map(folder=><button type="button" key={folder.id} onClick={()=>setSelectedFolder(folder.id)}
       className="flex min-h-12 items-center gap-3 rounded-xl border border-[#e4ede1] bg-[#f9fbf8] px-3 text-left text-sm text-[#426c4c] hover:bg-[#eaf3e8]">
       <Folder size={18} className="shrink-0"/><span className="min-w-0 flex-1 truncate font-semibold">{folder.name}</span>
       <span className="text-xs text-[#7b8e7d]">{folderCounts[folder.id]??0}</span>
       <ChevronRight size={15} className="text-[#9bab9c]"/>
      </button>)}
     </div>}
     {listBusy?<p role="status" className="py-12 text-center text-[#607265]">Chargement des formulaires…</p>:
      activeItems.length===0&&childFolders.length===0?<div className="py-14 text-center"><Files className="mx-auto text-[#638d6e]" size={34}/>
       <p className="mt-3 font-semibold text-[#36583e]">{searchTerm?'Aucun résultat pour cette recherche':showArchived?'Aucune archive':selectedFolder==='all'?'Aucun formulaire pour le moment':'Ce dossier est vide'}</p>
       <p className="mt-2 text-sm text-[#607265]">{showArchived?'Les formulaires archivés apparaîtront ici.':selectedFolder==='all'?'Crée ton premier questionnaire avec le bouton en haut.':'Déplace un formulaire ici en le faisant glisser ou depuis le menu « ⋯ ».'}</p>
      </div>:
      <div className="divide-y divide-[#e5ece3]">{activeItems.map(item=>
       <div key={item.id} draggable={item.role==='owner'} onDragStart={e=>{if(item.role==='owner'){e.dataTransfer.setData('application/x-monk-form',item.id);e.dataTransfer.effectAllowed='move';}}}
        className="group flex items-center gap-2 py-1">
        <span className="hidden text-[#a6b9a9] group-hover:text-[#64846e] sm:block" title="Glisser vers un dossier"><GripVertical size={16}/></span>
        <button type="button" onClick={()=>void openForm(item.id)} className="flex min-h-20 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 text-left hover:bg-[#f3f8f2] focus-visible:outline-2 focus-visible:outline-[#37784b] sm:px-3">
         <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e9f2e7] text-[#3c7650]"><FileText size={20}/></span>
         <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[#284b36] sm:text-base">{item.title}</span>
          <span className="mt-1 block text-xs text-[#607265]">{item.published?'Publié':'Brouillon'} · Modifié le {formatParisDate(item.updatedAt)}</span>
         </span>
        </button>
        <button type="button" aria-label="Voir les résultats du formulaire" title="Ouvrir les résultats" onClick={()=>void openForm(item.id,'results')}
         className="flex min-w-[74px] flex-col items-center rounded-lg px-2 py-2 text-[#477452] hover:bg-[#edf5e9]">
         <span className="text-lg font-bold tabular-nums">{item.submissionCount??0}</span>
         <span className="text-[10px] text-[#7a8f7e]">{item.submissionCount===1?'participation':'participations'}</span>
        </button>
        <button type="button" aria-label="Modifier le formulaire" title="Modifier le formulaire" onClick={()=>void openForm(item.id,'questions')}
         className="hidden min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs text-[#55735e] hover:bg-[#edf4ea] focus-visible:inline-flex sm:inline-flex"><FileText size={15}/> Modifier</button>
        <FormItemMenu title={item.title} archived={showArchived}
         onMove={item.role==='owner'?()=>setMoveTarget(item):undefined}
         onDuplicate={()=>void duplicateForm(item.id)}
         onArchive={()=>void performState(showArchived?'unarchive':'archive',item.id)}
         onDelete={()=>void performState('delete',item.id)}/>
       </div>)}</div>}
    </section>
   </div> : <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e3ebdf] bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3"><button title="Liste des formulaires" onClick={()=>void (async()=>{if(saveState!=='saved' && !(await askDialog({kind:'confirm',title:'Quitter l’éditeur ?',description:'Les modifications récentes ne sont pas encore confirmées comme enregistrées.',confirmLabel:'Quitter'})))return;setDetail(null);draftRef.current=null;})()} aria-label="Revenir aux formulaires" className="flex h-11 w-11 items-center justify-center rounded-lg text-[#41674e] hover:bg-[#edf4ed]"><ArrowLeft size={19}/></button><div><h1 className="max-w-[330px] truncate font-bold text-[#294936]">{detail.title}</h1><span className="text-xs text-[#607265]">{published?'Version publiée + brouillon':'Brouillon'} · {countQuestions(pages)} question(s)</span></div></div>
        <div className="flex flex-wrap items-center gap-2">{detail&&<span role="status" aria-live="polite" className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium ${saveState==='error'?'bg-red-50 text-red-700':saveState==='pending'?'bg-[#fff6e5] text-[#825e2b]':saveState==='saving'?'bg-[#edf2ec] text-[#506957]':'bg-[#eaf2e7] text-[#315c42]'}`}>
         {saveState==='saving'?<LoaderCircle size={14} className="animate-spin"/>:saveState==='error'?<CircleAlert size={14}/>:saveState==='pending'?<Clock3 size={14}/>:<CheckCircle2 size={14}/>}
         {{saved:'Enregistré',saving:'Enregistrement…',pending:'Non enregistré',error:'Sauvegarde échouée'}[saveState]}
       </span>}{published&&<><a className={light} target="_blank" rel="noopener noreferrer" href={`/f/${encodeURIComponent(detail.slug)}`}><Eye size={16}/> Voir le lien public</a><button className={light} onClick={()=>{void (async()=>{try{await navigator.clipboard.writeText(`${window.location.origin}/f/${encodeURIComponent(detail.slug)}`);}catch{setError("Copie impossible. Utilise le lien public.");}})();}}><Copy size={15}/> Copier le lien</button></>}<button className={light} onClick={()=>{setActiveTab('questions');setPreview(v=>!v);}}><Eye size={16}/>{preview?'Éditer':'Aperçu'}</button><button className={cta} disabled={!editable||operation||saveState==='saving'||saveState==='error'} onClick={()=>void publishForm()}><Send size={15}/> Publier</button></div>
      </div>
      <nav aria-label="Sections du formulaire" className="mb-5 flex gap-1.5 overflow-x-auto border-b border-[#dfe8dc] pb-2 sm:gap-2">
        {(['overview','questions','results','integrations','settings'] as const).filter(tab=>published||tab!=='overview').map(tab=><button key={tab} type="button"
         aria-current={activeTab===tab?'page':undefined} onClick={()=>{setPreview(false);setActiveTab(tab);}}
         className={`shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${activeTab===tab?'bg-[#e2f0e0] text-[#2d7246]':'text-[#47674e] hover:bg-[#eef5ed]'}`}>
          {{overview:'Vue d’ensemble',questions:'Éditeur',results:'Résultats',integrations:'Intégrations',settings:'Paramètres'}[tab]}
        </button>)}
       </nav>
       {detail.archivedAt&&<p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Ce formulaire est archivé ; son contenu ne peut pas être modifié.</p>}
      {activeTab==='overview'?<section aria-label="Vue d’ensemble du formulaire" className="space-y-5">
       <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="flex items-center gap-2 font-display text-2xl font-bold text-[#315a40]"><LayoutDashboard size={23}/> Vue d’ensemble</h2>
         <p className="mt-1 text-sm text-[#708575]">Suivez les participations et retrouvez les actions essentielles.</p></div>
        <button type="button" className={cta} onClick={()=>setActiveTab('results')}><BarChart3 size={16}/> Consulter les résultats</button>
       </div>
       <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[#e2ebde] bg-white p-5"><p className="text-3xl font-bold tabular-nums">{overviewResults?.total??items.find(i=>i.id===detail.id)?.submissionCount??0}</p><p className="mt-1 text-xs text-[#758d78]">Participations</p></div>
        <div className="rounded-xl border border-[#e2ebde] bg-white p-5"><p className="text-xl font-bold text-[#315e42]">{published?'Publié':'Brouillon'}</p><p className="mt-1 text-xs text-[#758d78]">État de publication</p></div>
        <div className="rounded-xl border border-[#e2ebde] bg-white p-5"><p className="text-3xl font-bold tabular-nums">{countQuestions(pages)}</p><p className="mt-1 text-xs text-[#758d78]">Questions du brouillon</p></div>
       </div>
       <div className="rounded-xl border border-[#e2ebde] bg-white p-5">
        <div className="mb-4 flex items-center justify-between gap-2"><h3 className="font-bold text-[#315b3f]">Dernières participations</h3>
         <button type="button" onClick={()=>setActiveTab('results')} className="text-xs font-semibold text-[#33754b] hover:underline">Toutes les réponses</button></div>
        {!overviewResults?<p className="text-sm text-[#829486]">Chargement des participations…</p>:
         overviewResults.submissions.length===0?<p className="text-sm text-[#829486]">Aucune réponse pour le moment.</p>:
         <div className="divide-y divide-[#edf1ea]">{overviewResults.submissions.map((sub,i)=><button key={sub.id} type="button" onClick={()=>setActiveTab('results')}
          className="flex min-h-12 w-full items-center justify-between gap-2 text-left text-sm text-[#4f7558] hover:bg-[#f5faf3]">
          <span>Participation {overviewResults.total-i}</span><span className="text-xs text-[#778b79]">{formatParisDateTime(sub.submittedAt)}</span>
         </button>)}</div>}
       </div>
       <div className="flex flex-wrap gap-2">
        <button type="button" className={light} onClick={()=>setActiveTab('questions')}><FileText size={16}/> Modifier les questions</button>
        <button type="button" className={light} onClick={()=>setActiveTab('integrations')}><Copy size={16}/> Intégrations</button>
       </div>
      </section>:
      activeTab==='results'?<ResultsPanel formId={detail.id} onOpenIntegrations={()=>setActiveTab('integrations')}/>:
 
       activeTab==='integrations'?<div className="max-w-2xl space-y-4">
        {googleOutcome==='verifying'&&<p role="status" className="rounded-xl bg-[#eff6ec] p-4 text-sm text-[#2f6546]">Vérification de votre compte Google et création du tableur…</p>}
        {googleOutcome==='connected'&&<p role="status" className="rounded-xl border border-[#cde6d0] bg-[#edf8ef] p-4 text-sm font-medium text-[#2e7048]">Compte Google autorisé. Le tableur a été créé ; vous pouvez l’ouvrir depuis cette page.</p>}
        {googleOutcome==='error'&&<p role="alert" className="rounded-xl border border-[#f4d6cf] bg-[#fff2ef] p-4 text-sm text-[#9b4735]">La connexion Google Sheets n’a pas abouti. Vérifiez votre compte Google, puis réessayez.</p>}
        <GoogleSheetsPanel key={detail.id} formId={detail.id} owner={detail.role==='owner'}/>
        {detail.role!=='owner'&&<p className="text-sm text-[#647969]">Seul le propriétaire de ce formulaire peut gérer la synchronisation Google Sheets.</p>}
       </div> :
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
          onPageIndex={idx=>{setPageIndex(idx);setQuestionId(null);}}
          selected={selected} editable={editable} onQuestionUpdate={updateQuestion}
          onAddQuestion={type=>documentRef.current?.insert(type)} onAddPage={addPage} onDeletePage={()=>void deletePage()}/>
        <section aria-label="Éditeur de page" className="min-w-0 rounded-[22px] border border-[#e4eae1] bg-white px-5 py-7 sm:px-10 sm:py-10">
         {page&&<>
          <div className="mb-5 flex items-center justify-between gap-3">
           <span className="text-xs font-medium text-[#607265]">{pages.length>1?'Page '+(pageIndex+1)+' sur '+pages.length:'Rédige ton formulaire comme un document'}</span>
           {editable&&<button type="button" onClick={addPage} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-[#366e48] hover:bg-[#eef5ea]"><Plus size={16}/> Ajouter une page</button>}
          </div>
          <DocumentCanvas key={page.id} ref={documentRef} page={page} editable={editable} onChange={updatePage}
            onSelectQuestion={id=>setQuestionId(id)}
            onOpenSettings={id=>{setQuestionId(id);setSideMode('settings');setSidebarOpen(true);}}
            onDeleteQuestion={id=>void deleteQuestion(id)}/>
          {pages.length>1&&editable&&<button type="button" onClick={()=>void deletePage()} className="mt-4 rounded-lg px-2 py-2 text-xs font-medium text-[#98534b] hover:bg-red-50">Supprimer cette page</button>}
         </>}
        </section>
       </div>}
    </>}
  </div>
   {dialog&&<StudioDialog intent={dialog} onResolve={resolveDialog}/>}
   {moveTarget&&<FolderMoveDialog formTitle={moveTarget.title} folders={folders} current={moveTarget.folderId??null} busy={operation} onMove={id=>void moveForm(id)} onClose={()=>setMoveTarget(null)}/>}
 </main>;
}
