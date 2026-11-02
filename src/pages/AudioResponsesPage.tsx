import { useEffect,useState } from 'react';
import { Link } from 'react-router-dom';
import { LoaderCircle, Play, ArrowLeft, Mic } from 'lucide-react';
import { getAccessToken } from '../authClient';
type AudioRecord={id:string;form_title:string;question:string;content_type:string;byte_size:number|string;duration_ms:number|null;submitted_at:string|null};
type ApiResponse<T>={ok:true;data:T}|{ok:false;error:{message:string}};
export function AudioResponsesPage(){
 const [items,setItems]=useState<AudioRecord[]>([]),[busy,setBusy]=useState(true);
 const [loadingId,setLoadingId]=useState(''),[error,setError]=useState('');
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
  {!busy&&!error&&items.length===0&&<p className="mt-8 rounded-2xl bg-[#f0f5ed] p-6 text-sm">Aucune réponse vocale pour le moment. Les enregistrements envoyés apparaîtront ici.</p>}
  <div className="mt-7 space-y-3">
   {items.map(item=><article key={item.id} className="rounded-2xl border border-[#e1e9df] bg-white p-5">
    <h2 className="font-semibold text-[#2a5438]">{item.form_title}</h2>
    <p className="mt-1 text-sm text-[#6f8173]">{item.question}</p>
    <p className="mt-2 text-xs text-[#819085]">{item.submitted_at?new Date(item.submitted_at).toLocaleString('fr-FR'):''}
      {' · '}{item.duration_ms?Math.ceil(item.duration_ms/1000)+' s':'Durée inconnue'}
      {' · '}{(Number(item.byte_size)/1048576).toFixed(2)+' Mo'}</p>
    <button type="button" onClick={()=>void play(item.id)} disabled={!!loadingId}
      className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#2b6746] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
      {loadingId===item.id?<LoaderCircle size={16} className="animate-spin"/>:<Play size={16}/>}
      Écouter
    </button>
    {player?.id===item.id&&<audio controls autoPlay preload="metadata" className="mt-3 w-full" src={player.url}/>}
   </article>)}
  </div>
 </main>;
}
