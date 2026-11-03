import { useCallback,useEffect,useMemo,useState } from 'react';
import { zipSync,strToU8 } from 'fflate';
import { BarChart3,Download,FileSpreadsheet,Headphones,LoaderCircle,Mic2,Info,CheckCircle2,Copy,Ellipsis } from 'lucide-react';
import {audioPlaybackUrl,formatParisDateTime} from '../../shared/presentation';
import { getAccessToken } from '../../authClient';
import type { FormResults,ResultAnswer,ResultSubmission } from '../../server/resultsService';
import { exportAudioAsMp3 } from '../../shared/mp3Export';
type Result<T>={ok:true;data:T}|{ok:false;error:{message:string}};
type AudioSummary={available:boolean;canManage:boolean;total:number;done:number;queued:number;failed:number;actionable:number;unsupported:number;quotaDelayed:number};
const formatted=(a:ResultAnswer)=>{
 if(a.audioId){const text=a.value&&typeof a.value==='object'&&!Array.isArray(a.value)&&'text' in a.value&&typeof a.value.text==='string'?a.value.text.trim():'';
  return `Enregistrement audio${a.durationMs?' ('+Math.ceil(a.durationMs/1000)+' s)':''} ; Écouter : ${audioPlaybackUrl(a.audioId)}${text?' ; Texte saisi : '+text:''}${a.transcript?' ; Transcription : '+a.transcript:''}`;
 }
 if(Array.isArray(a.value))return a.value.map(v=>human(v)).join(' ; ');
 if(typeof a.value==='string')return human(a.value);
 if(a.value==null)return '';
 return JSON.stringify(a.value);
};
const human=(val:unknown)=>typeof val==='string'&&val.startsWith('__other__:')?'Autre : '+val.slice(10):String(val??'');
function escapeCSV(value:unknown){return '"'+String(value??'').replace(/"/g,'""')+'"';}
function dataset(items:ResultSubmission[]){
 const questions=new Map<string,string>();
 for(const item of items)for(const answer of item.answers)questions.set(answer.questionId,answer.question);
 const columns=[...questions].map(([id,label])=>({id,label}));
 const headers=['Participation','Date de participation (Paris)',...columns.map(c=>c.label+' ('+c.id.slice(0,8)+')')];
 const rows=items.map(item=>[item.id,formatParisDateTime(item.submittedAt),...columns.map(c=>formatted(item.answers.find(a=>a.questionId===c.id)??{questionId:c.id,question:c.label,type:'',value:null,audioId:null,durationMs:null}))]);
 const hyperlinks=items.flatMap((s,i)=>s.answers.flatMap(a=>{
  if(!a.audioId)return [];
  const index=columns.findIndex(c=>c.id===a.questionId);if(index<0)return [];
  return [{row:i+2,column:index+3,url:audioPlaybackUrl(a.audioId)}];
 }));
 const csv='\uFEFF'+[headers,...rows].map(r=>r.map(escapeCSV).join(';')).join('\r\n');
 return {headers,rows,csv,columns,hyperlinks};
}
function download(name:string,data:Blob){
 const url=URL.createObjectURL(data);
 const link=document.createElement('a');link.href=url;link.download=name;
 document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function xlsxBytes(headers:string[],rows:string[][],hyperlinks:Array<{row:number;column:number;url:string}>){
 const enc=(value:string)=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
 const col=(index:number)=>{let n=index+1,out='';while(n){n--;out=String.fromCharCode(65+n%26)+out;n=Math.floor(n/26);}return out;};
 const values=[headers,...rows];
 const xml='<?xml version="1.0" encoding="utf-8" standalone="yes"?>'+
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>'+
  values.map((row,i)=>'<row r="'+(i+1)+'">'+row.map((v,j)=>'<c r="'+col(j)+(i+1)+'" t="inlineStr"><is><t xml:space="preserve">'+enc(v)+'</t></is></c>').join('')+'</row>').join('')+'</sheetData>'+ (hyperlinks.length?'<hyperlinks>'+hyperlinks.map((link,i)=>'<hyperlink ref="'+col(link.column-1)+link.row+'" r:id="rId'+(i+1)+'"/>').join('')+'</hyperlinks>':'')+'</worksheet>';
 return zipSync({
  '[Content_Types].xml':strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
  '_rels/.rels':strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
  'xl/workbook.xml':strToU8('<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Réponses" sheetId="1" r:id="rId1"/></sheets></workbook>'),
  'xl/_rels/workbook.xml.rels':strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
  'xl/worksheets/sheet1.xml':strToU8(xml),
   'xl/worksheets/_rels/sheet1.xml.rels':strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
    hyperlinks.map((link,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="'+enc(link.url)+'" TargetMode="External"/>').join('')+'</Relationships>'),
 },{level:5});
}
async function requestFormResults(formId:string,page:number):Promise<FormResults>{
 const token=await getAccessToken();if(!token)throw Error('Connexion expirée. Reconnectez-vous.');
 const response=await fetch(`/api/forms/${formId}/results?page=${page}&limit=100`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
 const body=await response.json() as Result<FormResults>;
 if(!body.ok)throw Error(body.error.message);
 return body.data;
}
const fetchAll=async(formId:string)=>{
 const first=await requestFormResults(formId,0),all=[...first.submissions];
 const pages=Math.ceil(first.total/100);
 if(first.total>3000)throw Error('Plus de 3 000 réponses : export trop volumineux, contactez le support.');
 for(let p=1;p<pages;p++)all.push(...(await requestFormResults(formId,p)).submissions);
 return all;
};
function ChoiceChart({question,answers}:{question:string;answers:ResultAnswer[]}){
 const tally=new Map<string,number>();
 for(const answer of answers){
  const values=Array.isArray(answer.value)?answer.value:[answer.value];
  for(const v of values){if(typeof v!=='string'||!v)continue;
   const key=v.startsWith('__other__:')?'Autre':v;
   tally.set(key,(tally.get(key)??0)+1);
  }
 }
 const items=[...tally].sort((a,b)=>b[1]-a[1]).slice(0,12);
 const max=Math.max(1,...items.map(a=>a[1]));
 return <article className="rounded-2xl border border-[#e0e9de] bg-white p-5">
  <h3 className="font-semibold text-[#31553b]">{question}</h3>
  <div className="mt-4 space-y-2">{items.map(([value,count])=><div key={value} className="grid grid-cols-[minmax(65px,130px)_1fr_30px] items-center gap-3 text-xs">
   <span className="truncate text-[#58725d]" title={value}>{value}</span>
   <div className="h-2.5 overflow-hidden rounded-full bg-[#edf3eb]"><div className="h-full rounded-full bg-[#76a283]" style={{width:`${count/max*100}%`}}/></div>
   <span className="text-right tabular-nums text-[#58725d]">{count}</span>
  </div>)}</div>
 </article>;
}
export function ResultsPanel({formId,onOpenIntegrations}:{formId:string;onOpenIntegrations?:()=>void}){
 const [data,setData]=useState<FormResults|null>(null),[loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[progress,setProgress]=useState(''),[view,setView]=useState<'summary'|'individual'>('summary');
 const [player,setPlayer]=useState<{id:string;url:string}|null>(null);
 const [transcriptionSummary,setTranscriptionSummary]=useState<AudioSummary|null>(null);
 const [bulkStarted,setBulkStarted]=useState(false);
 const refreshSummary=useCallback(async()=>{
  const token=await getAccessToken();if(!token)throw Error('Session expirée.');
  const res=await fetch('/api/forms/'+formId+'/audio-transcription',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
  const json=await res.json() as Result<AudioSummary>;
  if(!json.ok)throw Error(json.error.message);
  return json.data;
 },[formId]);
 useEffect(()=>{let active=true;setLoading(true);setError('');setData(null);
  requestFormResults(formId,0).then(x=>{if(active)setData(x)}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Résultats indisponibles.')})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[formId]);
 useEffect(()=>()=>{if(player)URL.revokeObjectURL(player.url);},[player]);
 useEffect(()=>{let active=true;setTranscriptionSummary(null);setBulkStarted(false);
  void refreshSummary().then(s=>{if(active)setTranscriptionSummary(s)}).catch(()=>{});
  return()=>{active=false};
 },[refreshSummary]);
 useEffect(()=>{
  if(!transcriptionSummary?.queued)return;
  let active=true;
  const timer=setInterval(()=>{
   void Promise.all([requestFormResults(formId,0),refreshSummary()]).then(([results,summary])=>{
    if(active){setData(results);setTranscriptionSummary(summary);}
   }).catch(()=>{});
  },11000);
  return()=>{active=false;clearInterval(timer)};
 },[formId,refreshSummary,transcriptionSummary?.queued]);
 async function transcribe(id:string,force=false){
  if(busy)return;setBusy('transcribe:'+id);setError('');
  try{
   const token=await getAccessToken();if(!token)throw Error('Session expirée.');
   const res=await fetch('/api/audio/'+id+'/transcribe',{method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({force})});
   const body=await res.json() as Result<{status:string}>;
   if(!body.ok)throw Error(body.error.message);
   setData(current=>current?{...current,submissions:current.submissions.map(s=>({...s,
    answers:s.answers.map(a=>a.audioId===id?{...a,transcriptionStatus:'pending'}:a)}))}:current);
   setTranscriptionSummary(await refreshSummary());
  }catch(e){setError(e instanceof Error?e.message:'Transcription impossible.');}
  finally{setBusy('');}
 }
 async function transcribeAll(){
  if(busy||!transcriptionSummary?.canManage||!transcriptionSummary.actionable)return;
  setBusy('bulk');setError('');setBulkStarted(true);
  try{
   const token=await getAccessToken();if(!token)throw Error('Session expirée.');
   const res=await fetch('/api/forms/'+formId+'/audio-transcription/run',{method:'POST',headers:{Authorization:'Bearer '+token}});
   const body=await res.json() as Result<AudioSummary>;
   if(!body.ok)throw Error(body.error.message);
   setTranscriptionSummary(body.data);
   setData(await requestFormResults(formId,0));
  }catch(e){setError(e instanceof Error?e.message:'Transcription groupée indisponible.');}
  finally{setBusy('');}
 }
 async function copyTranscript(text:string){
  try{await navigator.clipboard.writeText(text);}
  catch{setError('Impossible de copier la transcription.');}
 }
 const questions=useMemo(()=>{
  const groups=new Map<string,{label:string;type:string;answers:ResultAnswer[]}>();
  for(const s of data?.submissions??[])for(const a of s.answers){
   if(!groups.has(a.questionId))groups.set(a.questionId,{label:a.question,type:a.type,answers:[]});
   groups.get(a.questionId)!.answers.push(a);
  }return [...groups.values()];
 },[data]);
 async function doExport(format:'csv'|'xlsx'|'zip'){
  setBusy(format);setError('');setProgress('');
  try{
   const all=await fetchAll(formId),sheet=dataset(all);
   const name='reponses-'+formId.slice(0,8);
   if(format==='csv')download(name+'.csv',new Blob([sheet.csv],{type:'text/csv;charset=utf-8'}));
   if(format==='xlsx')download(name+'.xlsx',new Blob([xlsxBytes(sheet.headers,sheet.rows,sheet.hyperlinks) as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
   if(format==='zip'){
    const archive:Record<string,Uint8Array>={'reponses.csv':strToU8(sheet.csv),
      'reponses.json':strToU8(JSON.stringify(all,null,2))};
    const audio=all.flatMap(s=>s.answers.filter(a=>a.audioId).map(a=>({submission:s.id,...a})));
    if(audio.length>80)throw Error('Export ZIP limité à 80 audios par téléchargement.');
    const token=await getAccessToken();if(!token)throw Error('Session expirée.');
    let bytes=0;
    for(const [index,a] of audio.entries()){
     const response=await fetch(`/api/audio/${a.audioId}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
     if(!response.ok)throw Error('Impossible de récupérer un des enregistrements.');
     const original=await response.blob();
     setProgress(`Conversion MP3 ${index+1}/${audio.length}…`);
     const mp3=await exportAudioAsMp3(original);
     bytes+=mp3.size;
     if(bytes>100*1048576)throw Error('Le ZIP dépasserait 100 Mio. Exportez un ensemble plus petit.');
     archive[`audios/${a.submission.slice(0,8)}-${a.audioId}.mp3`]=new Uint8Array(await mp3.arrayBuffer());
    }
    download(name+'.zip',new Blob([zipSync(archive,{level:0}) as BlobPart],{type:'application/zip'}));
   }
  }catch(e){setError(e instanceof Error?e.message:'Export impossible.');}finally{setBusy('');setProgress('');}
 }
 async function downloadMp3(id:string,submissionId:string){
  if(busy)return;
  setBusy('mp3:'+id);setError('');setProgress('Préparation du MP3…');
  try{
   const token=await getAccessToken();if(!token)throw Error('Connexion expirée.');
   const response=await fetch(`/api/audio/${id}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
   if(!response.ok)throw Error('Enregistrement inaccessible.');
   const mp3=await exportAudioAsMp3(await response.blob(),fraction=>setProgress(`Conversion MP3 : ${Math.round(fraction*100)} %`));
   download(`reponse-${submissionId.slice(0,8)}-${id.slice(0,8)}.mp3`,mp3);
  }catch(e){setError(e instanceof Error?e.message:'Téléchargement MP3 impossible.');}
  finally{setBusy('');setProgress('');}
 }
 async function play(id:string){
  setBusy(id);setError('');
  try{
   const token=await getAccessToken();if(!token)throw Error('Connexion expirée.');
   const response=await fetch(`/api/audio/${id}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
   if(!response.ok)throw Error('Enregistrement indisponible.');
   const blob=await response.blob();setPlayer({id,url:URL.createObjectURL(blob)});
  }catch(e){setError(e instanceof Error?e.message:'Lecture impossible.');}finally{setBusy('');}
 }
 return <section aria-label="Résultats du formulaire" className="space-y-5">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div><h2 className="font-display text-2xl font-bold text-[#2d5038]">Résultats</h2><p className="mt-1 text-sm text-[#7e907f]">Réponses et enregistrements de ce formulaire.</p></div>
   <div className="flex flex-wrap items-center gap-2">
    {onOpenIntegrations&&<button type="button" onClick={onOpenIntegrations} className="inline-flex items-center gap-2 rounded-xl border border-[#bcd9bd] bg-[#ebf6ea] px-3 py-2 text-xs font-semibold text-[#2a6c40] hover:bg-[#dff0dd]"><FileSpreadsheet size={15}/> Synchroniser avec Google Sheets</button>}
    {(['csv','xlsx','zip'] as const).map(type=><button key={type} disabled={!!busy||loading}
      onClick={()=>void doExport(type)} className="inline-flex items-center gap-1.5 rounded-xl border border-[#dce7db] bg-white px-3 py-2 text-xs font-semibold text-[#3a6950] hover:bg-[#eff6ef] disabled:opacity-50">
      {busy===type?<LoaderCircle size={14} className="animate-spin"/>:type==='xlsx'?<FileSpreadsheet size={14}/>:<Download size={14}/>}
      {type==='zip'?'ZIP + audios MP3':type.toUpperCase()}</button>)}
   </div>
  </div>
  {transcriptionSummary&&<section aria-label="Transcription audio" className="rounded-xl border border-[#dce9d9] bg-white px-4 py-3 sm:px-5">
   <div className="flex flex-wrap items-center justify-between gap-4">
    <div className="flex min-w-0 items-start gap-3">
     <Mic2 className="mt-0.5 shrink-0 text-[#3e7854]" size={20}/>
     <div>
      <div className="flex items-center gap-2">
       <h3 className="text-sm font-bold text-[#31573c]">Transcription audio</h3>
       <details className="relative">
        <summary aria-label="Informations sur la transcription" title="Informations sur la transcription"
         className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-full text-[#758977] hover:bg-[#eff5ed] [&::-webkit-details-marker]:hidden"><Info size={16}/></summary>
        <div className="absolute left-0 top-8 z-30 w-72 rounded-xl border border-[#e0eadf] bg-white p-3 text-xs leading-5 text-[#53705c] shadow-lg">
         Transcription réalisée avec Cloudflare Whisper Large V3 Turbo. Les audios sont envoyés à Cloudflare seulement après votre demande. L’offre gratuite a un quota quotidien ; au-delà, le traitement attend sans achat. Le texte généré par IA peut contenir des erreurs ; conservez les fichiers originaux.
        </div>
       </details>
      </div>
      <p className="mt-0.5 text-xs text-[#788979]">Transformez vos enregistrements en texte, à la demande.</p>
      <p className="mt-2 text-xs font-medium text-[#52735c]">
       {transcriptionSummary.total} audio{transcriptionSummary.total>1?'s':''} au total · {transcriptionSummary.done} transcrit{transcriptionSummary.done>1?'s':''} · {transcriptionSummary.actionable} à transcrire
      </p>
     </div>
    </div>
    {transcriptionSummary.actionable>0&&transcriptionSummary.available&&transcriptionSummary.canManage?
     <button type="button" disabled={!!busy} onClick={()=>void transcribeAll()}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#2f6546] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#255339] disabled:opacity-50">
      {busy==='bulk'?<LoaderCircle size={16} className="animate-spin"/>:<Mic2 size={16}/>}
      {busy==='bulk'?'Lancement…':'Transcrire '+transcriptionSummary.actionable+' audio'+(transcriptionSummary.actionable>1?'s':'')}
     </button>:
     transcriptionSummary.total>0&&transcriptionSummary.queued===0&&transcriptionSummary.done===transcriptionSummary.total?
      <p role="status" className="flex items-center gap-2 text-sm font-semibold text-[#2d7048]"><CheckCircle2 size={18}/> Tous les audios sont transcrits</p>:
      null}
   </div>
   {transcriptionSummary.queued>0&&<div className="mt-4 space-y-2 border-t border-[#edf1e9] pt-3" role="status" aria-live="polite">
    <div className="flex justify-between gap-2 text-xs font-medium text-[#4c7256]">
     <span><LoaderCircle size={13} className="mr-1 inline animate-spin"/> Transcription en cours ; vous pouvez quitter cette page.</span>
     <span className="tabular-nums">{transcriptionSummary.done} / {transcriptionSummary.total}</span>
    </div>
    <div className="h-1.5 overflow-hidden rounded-full bg-[#e8efe5]">
     <div className="h-full rounded-full bg-[#72a17d] transition-all"
      style={{width:(100*transcriptionSummary.done/Math.max(1,transcriptionSummary.total))+'%'}}/>
    </div>
   </div>}
   {transcriptionSummary.quotaDelayed>0&&<p role="status" className="mt-3 text-xs text-[#986d34]">Quota gratuit Cloudflare atteint. {transcriptionSummary.quotaDelayed} audio(s) attendent le renouvellement quotidien ; les transcriptions terminées sont conservées.</p>}
   {transcriptionSummary.unsupported>0&&<p className="mt-3 text-xs text-[#986d34]">{transcriptionSummary.unsupported} enregistrement(s) dépassent 18 Mio et nécessitent un fichier plus court pour Cloudflare.</p>}
   {transcriptionSummary.failed>0&&!transcriptionSummary.queued&&<p className="mt-3 text-xs text-[#986d34]">{transcriptionSummary.failed} audio(s) à relancer. Utilisez le bouton global ou l’action individuelle.</p>}
   {bulkStarted&&transcriptionSummary.total>0&&transcriptionSummary.queued===0&&transcriptionSummary.actionable===0&&<p className="mt-2 text-xs text-[#628469]">Le texte est consultable dans Participations et dans les prochains exports.</p>}
  </section>}
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  {progress&&<p role="status" className="flex items-center gap-2 rounded-xl bg-[#eef5ec] p-3 text-sm text-[#356344]"><LoaderCircle size={16} className="animate-spin"/>{progress}</p>}
  {loading?<p role="status" className="text-sm text-[#72917a]"><LoaderCircle size={17} className="inline animate-spin"/> Chargement des réponses…</p>:
   data&&<>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
     <div className="rounded-xl bg-white p-4"><p className="text-2xl font-bold">{data.total}</p><p className="text-xs text-[#78907c]">Participations</p></div>
     <div className="rounded-xl bg-white p-4"><p className="text-2xl font-bold">{data.submissions.length}</p><p className="text-xs text-[#78907c]">Réponses chargées</p></div>
     <div className="rounded-xl bg-white p-4"><p className="text-2xl font-bold">{data.submissions.reduce((n,s)=>n+s.answers.filter(a=>a.audioId).length,0)}</p><p className="text-xs text-[#78907c]">Audios chargés</p></div>
    </div>
    {data.total>data.submissions.length&&<p className="text-xs text-[#927c5c]">Le résumé présente les {data.submissions.length} participations les plus récentes ; l’export comprend toutes les réponses (jusqu’à 3 000).</p>}
    <div className="flex gap-2 border-b border-[#dce5d9] pb-2">
     <button className={`rounded-lg px-4 py-2 text-sm ${view==='summary'?'bg-[#e1efe0] font-semibold text-[#315e3c]':'text-[#6c8072]'}`} onClick={()=>setView('summary')}><BarChart3 size={16} className="mr-1 inline"/> Résumé</button>
     <button className={`rounded-lg px-4 py-2 text-sm ${view==='individual'?'bg-[#e1efe0] font-semibold text-[#315e3c]':'text-[#6c8072]'}`} onClick={()=>setView('individual')}><Headphones size={16} className="mr-1 inline"/> Participations</button>
    </div>
    {view==='summary'?
     <div className="space-y-3">{questions.filter(x=>['single_choice','multiple_choice','select'].includes(x.type)).map(q=><ChoiceChart key={q.label} question={q.label} answers={q.answers}/>)}
      {questions.length===0&&<p className="rounded-xl bg-white p-5 text-sm text-[#7d917f]">Aucune réponse reçue pour le moment.</p>}</div>:
     <div className="space-y-3">{data.submissions.map(sub=><article key={sub.id} className="rounded-xl border border-[#e1e8df] bg-white p-4">
      <p className="text-xs font-semibold text-[#7c8f7f]">{sub.submittedAt?formatParisDateTime(sub.submittedAt)+' · Paris':'Date inconnue'}</p>
      {sub.answers.map(ans=><div className="mt-3 border-t border-[#f0f3ef] pt-3" key={ans.questionId}>
       <p className="text-xs font-semibold text-[#637b68]">{ans.question}</p><p className="mt-1 whitespace-pre-wrap text-sm text-[#36503b]">{ans.audioId?"Enregistrement audio"+(ans.durationMs?" ("+Math.ceil(ans.durationMs/1000)+" s)":""):formatted(ans)}</p>
       {ans.audioId&&<><div className="mt-2 flex flex-wrap gap-2"><button className="rounded-lg border border-[#d8e7db] px-3 py-2 text-xs font-semibold text-[#397450]"
         disabled={!!busy} onClick={()=>void play(ans.audioId!)}>{busy===ans.audioId?'Chargement…':'Écouter la réponse'}</button>
        <button className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8e7db] px-3 py-2 text-xs font-semibold text-[#397450] disabled:opacity-50"
         disabled={!!busy} onClick={()=>void downloadMp3(ans.audioId!,sub.id)}><Download size={14}/>{busy==='mp3:'+ans.audioId?'Conversion…':'Télécharger MP3'}</button></div>
        {player?.id===ans.audioId&&<audio className="mt-2 w-full" controls autoPlay src={player.url}/>}
         <div className="mt-3 rounded-xl border border-[#dbe8db] bg-[#f7faf5] p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
           <p className="text-xs font-semibold text-[#3b6249]">Transcription</p>
           {!ans.transcript&&transcriptionSummary?.available&&transcriptionSummary.canManage&&!['pending','processing'].includes(ans.transcriptionStatus??'')&&
            <button type="button" onClick={()=>void transcribe(ans.audioId!)} disabled={!!busy} className="rounded-lg border border-[#b8d8be] bg-white px-3 py-1.5 text-xs font-semibold text-[#336c46] hover:bg-[#e6f2e6] disabled:opacity-50">
             {busy==='transcribe:'+ans.audioId?'Envoi…':ans.transcriptionStatus==='failed'?'Réessayer':'Transcrire cet audio'}
            </button>}
           {ans.transcript&&<details className="relative ml-auto">
            <summary aria-label="Actions de transcription" title="Actions de transcription" className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-[#608068] hover:bg-[#e7f1e5] [&::-webkit-details-marker]:hidden"><Ellipsis size={17}/></summary>
            <div className="absolute right-0 top-9 z-20 w-48 rounded-xl border border-[#dae6d8] bg-white p-1.5 shadow-lg">
             <button type="button" onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');void copyTranscript(ans.transcript!);}} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-[#edf5eb]"><Copy size={14}/> Copier le texte</button>
             {transcriptionSummary?.canManage&&<button type="button" disabled={!!busy} onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');void transcribe(ans.audioId!,true);}} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-[#edf5eb]"><Mic2 size={14}/> Retranscrire</button>}
            </div>
           </details>}
          </div>
          {ans.transcript?<div>
           <p className="mb-2 text-[11px] text-[#778b78]">Texte généré par IA ; vérifiez les passages importants à l’écoute.</p>
           <p className="whitespace-pre-wrap text-sm leading-6 text-[#365342]">{ans.transcript}</p>
           {['pending','processing'].includes(ans.transcriptionStatus??'')&&<p role="status" className="mt-2 text-xs text-[#527b5c]">Nouvelle transcription en cours…</p>}
          </div>:
           ['pending','processing'].includes(ans.transcriptionStatus??'')?<p className="text-xs text-[#657f69]">Transcription en cours ; le texte apparaîtra ici automatiquement.</p>:
           ans.transcriptionStatus==='failed'?<p className="text-xs text-[#a35b43]">{ans.transcriptionError||'La transcription a échoué.'}</p>:
           <p className="text-xs text-[#7a8a7d]">Aucune transcription pour cet enregistrement.</p>}
         </div></>}
      </div>)}
     </article>)}</div>}
   </>}
 </section>;
}
