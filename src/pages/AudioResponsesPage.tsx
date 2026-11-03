import { useEffect,useState } from 'react';
import { Link } from 'react-router-dom';
import { LoaderCircle, Play, ArrowLeft, Mic, Download } from 'lucide-react';
import { getAccessToken } from '../authClient';
import { exportAudioAsMp3 } from '../shared/mp3Export';
import {formatParisDateTime} from '../shared/presentation';
type AudioRecord={id:string;form_title:string;question:string;content_type:string;byte_size:number|string;duration_ms:number|null;submitted_at:string|null};
type ApiResponse<T>={ok:true;data:T}|{ok:false;error:{message:string}};
export function AudioResponsesPage(){
 const [items,setItems]=useState<AudioRecord[]>([]),[busy,setBusy]=useState(true);
 const [loadingId,setLoadingId]=useState(''),[error,setError]=useState(''),[progress,setProgress]=useState('');
 const [player,setPlayer]=useState<{id:string;url:string}|null>(null);
 useEffect(()=>{
  let active=true;
  (async()=>{
   try{
    const token=await getAccessToken();if(!token)throw new Error('Reconnecte-toi pour écouter les enregistrements.');
    const res=await fetch('/api/audio',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
    const body=await res.json() as ApiResponse<AudioRecord[]>;
    if(!res.ok||!body.ok)throw new Error(body.ok?'Impossible de charger les réponses.':body.error.message);
    if(active)setItems(body.data);
   }catch(e){if(active)setError(e instanceof Error?e.message:'Connexion indisponible.');}
   finally{if(active)setBusy(false);}
  })();
  return ()=>{active=false;};
 },[]);
 useEffect(()=>()=>{if(player?.url)URL.revokeObjectURL(player.url);},[player?.url]);
 async function downloadMp3(id:string){
  setError('');setLoadingId(id);setProgress('Préparation du MP3…');
  try{
   const token=await getAccessToken();if(!token)throw new Error('Reconnecte-toi pour exporter cet audio.');
   const response=await fetch(`/api/audio/${id}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
   if(!response.ok)throw new Error('Enregistrement inaccessible.');
   const mp3=await exportAudioAsMp3(await response.blob(),progress=>setProgress(`Conversion MP3 : ${Math.round(progress*100)} %`));
   const url=URL.createObjectURL(mp3);
   const anchor=document.createElement('a');anchor.href=url;anchor.download=`reponse-${id.slice(0,8)}.mp3`;
   document.body.appendChild(anchor);anchor.click();anchor.remove();
   setTimeout(()=>URL.revokeObjectURL(url),1500);
  }catch(e){setError(e instanceof Error?e.message:'Export MP3 impossible.');}
  finally{setLoadingId('');setProgress('');}
 }
 async function play(id:string){
  setError('');setLoadingId(id);
  try{
   const token=await getAccessToken();if(!token)throw new Error('Reconnecte-toi pour écouter cet audio.');
   const response=await fetch(`/api/audio/${id}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
   if(!response.ok)throw new Error('Enregistrement inaccessible ou indisponible.');
   const file=await response.blob();
   setPlayer({id,url:URL.createObjectURL(file)});
  }catch(e){setError(e instanceof Error?e.message:'Lecture impossible.');}
  finally{setLoadingId('');}
 }
 return <main className="mx-auto max-w-3xl px-5 py-10">
  <Link to="/studio" className="inline-flex items-center gap-2 text-sm font-semibold text-[#387252]"><ArrowLeft size={16}/> Retour au Studio</Link>
  <h1 className="mt-6 flex items-center gap-3 font-display text-3xl font-bold text-[#27563c]"><Mic/> Réponses vocales</h1>
  <p className="mt-2 text-sm text-[#6e8173]">Les enregistrements restent privés et accessibles aux responsables des formulaires.</p>
  {busy&&<p role="status" className="mt-8"><LoaderCircle className="inline animate-spin"/> Chargement des réponses…</p>}
  {error&&<p role="alert" className="mt-7 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
  {progress&&<p role="status" className="mt-5 flex items-center gap-2 text-sm text-[#397450]"><LoaderCircle size={16} className="animate-spin"/>{progress}</p>}
  {!busy&&!error&&items.length===0&&<p className="mt-8 rounded-2xl bg-[#f0f5ed] p-6 text-sm">Aucune réponse vocale pour le moment. Les enregistrements envoyés apparaîtront ici.</p>}
  <div className="mt-7 space-y-3">
   {items.map(item=><article key={item.id} className="rounded-2xl border border-[#e1e9df] bg-white p-5">
    <h2 className="font-semibold text-[#2a5438]">{item.form_title}</h2>
    <p className="mt-1 text-sm text-[#6f8173]">{item.question}</p>
    <p className="mt-2 text-xs text-[#819085]">{item.submitted_at?formatParisDateTime(item.submitted_at)+' · Paris':''}
      {' · '}{item.duration_ms?Math.ceil(item.duration_ms/1000)+' s':'Durée inconnue'}
      {' · '}{(Number(item.byte_size)/1048576).toFixed(2)+' Mo'}</p>
    <div className="mt-3 flex flex-wrap items-center gap-2">
     <button type="button" onClick={()=>void play(item.id)} disabled={!!loadingId}
      className="inline-flex items-center gap-2 rounded-xl bg-[#2b6746] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
      {loadingId===item.id?<LoaderCircle size={16} className="animate-spin"/>:<Play size={16}/>}
      Écouter
     </button>
     <button type="button" onClick={()=>void downloadMp3(item.id)} disabled={!!loadingId}
      className="inline-flex items-center gap-2 rounded-xl border border-[#d8e7db] bg-white px-4 py-2 text-sm font-semibold text-[#397450] disabled:opacity-60">
      {loadingId===item.id?<LoaderCircle size={16} className="animate-spin"/>:<Download size={16}/>}
      Télécharger MP3
     </button>
    </div>
    {player?.id===item.id&&<audio controls autoPlay preload="metadata" className="mt-3 w-full" src={player.url}/>}
   </article>)}
  </div>
 </main>;
}
