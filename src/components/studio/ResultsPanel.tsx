import { useEffect,useMemo,useState } from 'react';
import { zipSync,strToU8 } from 'fflate';
import { BarChart3,Download,FileSpreadsheet,Headphones,LoaderCircle,RefreshCw } from 'lucide-react';
import { getAccessToken } from '../../authClient';
import type { FormResults,ResultAnswer,ResultSubmission } from '../../server/resultsService';
type Result<T>={ok:true;data:T}|{ok:false;error:{message:string}};
const formatted=(a:ResultAnswer)=>{
 if(a.audioId)return `Enregistrement audio${a.durationMs?' ('+Math.ceil(a.durationMs/1000)+' s)':''}`;
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
 const headers=['Participation','Date',...columns.map(c=>c.label+' ('+c.id.slice(0,8)+')')];
 const rows=items.map(item=>[item.id,item.submittedAt??'',...columns.map(c=>formatted(item.answers.find(a=>a.questionId===c.id)??{questionId:c.id,question:c.label,type:'',value:null,audioId:null,durationMs:null}))]);
 const csv='\uFEFF'+[headers,...rows].map(r=>r.map(escapeCSV).join(';')).join('\r\n');
 return {headers,rows,csv,columns};
}
function download(name:string,data:Blob){
 const url=URL.createObjectURL(data);
 const link=document.createElement('a');link.href=url;link.download=name;
 document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function xlsxBytes(headers:string[],rows:string[][]){
 const enc=(value:string)=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
 const col=(index:number)=>{let n=index+1,out='';while(n){n--;out=String.fromCharCode(65+n%26)+out;n=Math.floor(n/26);}return out;};
 const values=[headers,...rows];
 const xml='<?xml version="1.0" encoding="utf-8" standalone="yes"?>'+
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+
  values.map((row,i)=>'<row r="'+(i+1)+'">'+row.map((v,j)=>'<c r="'+col(j)+(i+1)+'" t="inlineStr"><is><t xml:space="preserve">'+enc(v)+'</t></is></c>').join('')+'</row>').join('')+'</sheetData></worksheet>';
 return zipSync({
  '[Content_Types].xml':strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
  '_rels/.rels':strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
  'xl/workbook.xml':strToU8('<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Réponses" sheetId="1" r:id="rId1"/></sheets></workbook>'),
  'xl/_rels/workbook.xml.rels':strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
  'xl/worksheets/sheet1.xml':strToU8(xml),
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
export function ResultsPanel({formId}:{formId:string}){
 const [data,setData]=useState<FormResults|null>(null),[loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[view,setView]=useState<'summary'|'individual'>('summary');
 const [player,setPlayer]=useState<{id:string;url:string}|null>(null);
 useEffect(()=>{let active=true;setLoading(true);setError('');setData(null);
  requestFormResults(formId,0).then(x=>{if(active)setData(x)}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Résultats indisponibles.')})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[formId]);
 useEffect(()=>()=>{if(player)URL.revokeObjectURL(player.url);},[player]);
 const questions=useMemo(()=>{
  const groups=new Map<string,{label:string;type:string;answers:ResultAnswer[]}>();
  for(const s of data?.submissions??[])for(const a of s.answers){
   if(!groups.has(a.questionId))groups.set(a.questionId,{label:a.question,type:a.type,answers:[]});
   groups.get(a.questionId)!.answers.push(a);
  }return [...groups.values()];
 },[data]);
 async function doExport(format:'csv'|'xlsx'|'zip'){
  setBusy(format);setError('');
  try{
   const all=await fetchAll(formId),sheet=dataset(all);
   const name='reponses-'+formId.slice(0,8);
   if(format==='csv')download(name+'.csv',new Blob([sheet.csv],{type:'text/csv;charset=utf-8'}));
   if(format==='xlsx')download(name+'.xlsx',new Blob([xlsxBytes(sheet.headers,sheet.rows) as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
   if(format==='zip'){
    const archive:Record<string,Uint8Array>={'reponses.csv':strToU8(sheet.csv),
      'reponses.json':strToU8(JSON.stringify(all,null,2))};
    const audio=all.flatMap(s=>s.answers.filter(a=>a.audioId).map(a=>({submission:s.id,...a})));
    if(audio.length>80)throw Error('Export ZIP limité à 80 audios par téléchargement.');
    const token=await getAccessToken();if(!token)throw Error('Session expirée.');
    let bytes=0;
    for(const a of audio){
     const response=await fetch(`/api/audio/${a.audioId}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
     if(!response.ok)throw Error('Impossible de récupérer un des enregistrements.');
     const blob=await response.blob();bytes+=blob.size;
     if(bytes>100*1048576)throw Error('Le ZIP dépasserait 100 Mio. Exportez un ensemble plus petit.');
     const ext=blob.type.includes('webm')?'webm':blob.type.includes('ogg')?'ogg':blob.type.includes('mp4')?'m4a':blob.type.includes('wav')?'wav':'audio';
     archive[`audios/${a.submission.slice(0,8)}-${a.audioId}.${ext}`]=new Uint8Array(await blob.arrayBuffer());
    }
    download(name+'.zip',new Blob([zipSync(archive,{level:0}) as BlobPart],{type:'application/zip'}));
   }
  }catch(e){setError(e instanceof Error?e.message:'Export impossible.');}finally{setBusy('');}
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
    {(['csv','xlsx','zip'] as const).map(type=><button key={type} disabled={!!busy||loading}
      onClick={()=>void doExport(type)} className="inline-flex items-center gap-1.5 rounded-xl border border-[#dce7db] bg-white px-3 py-2 text-xs font-semibold text-[#3a6950] hover:bg-[#eff6ef] disabled:opacity-50">
      {busy===type?<LoaderCircle size={14} className="animate-spin"/>:type==='xlsx'?<FileSpreadsheet size={14}/>:<Download size={14}/>}
      {type==='zip'?'ZIP + audios':type.toUpperCase()}</button>)}
   </div>
  </div>
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
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
      <p className="text-xs font-semibold text-[#7c8f7f]">{sub.submittedAt?new Date(sub.submittedAt).toLocaleString('fr-FR'):'Date inconnue'}</p>
      {sub.answers.map(ans=><div className="mt-3 border-t border-[#f0f3ef] pt-3" key={ans.questionId}>
       <p className="text-xs font-semibold text-[#637b68]">{ans.question}</p><p className="mt-1 whitespace-pre-wrap text-sm text-[#36503b]">{formatted(ans)}</p>
       {ans.audioId&&<><button className="mt-2 rounded-lg border border-[#d8e7db] px-3 py-2 text-xs font-semibold text-[#397450]"
         disabled={!!busy} onClick={()=>void play(ans.audioId!)}>{busy===ans.audioId?'Chargement…':'Écouter la réponse'}</button>
        {player?.id===ans.audioId&&<audio className="mt-2 w-full" controls autoPlay src={player.url}/>}</>}
      </div>)}
     </article>)}</div>}
    <div className="rounded-xl border border-[#e5eee3] bg-[#f8fbf7] p-4 text-sm text-[#6d8673]">
     <p className="font-semibold text-[#4a7656]">Google Sheets</p>
     <p className="mt-1">La synchronisation automatique nécessitera une autorisation Google Sheets spécifique. Les exports CSV et XLSX peuvent déjà être importés dans Google Sheets.</p>
    </div>
   </>}
 </section>;
}
