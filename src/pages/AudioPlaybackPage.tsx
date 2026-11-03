import {useEffect,useState} from 'react';
import {Link,useParams} from 'react-router-dom';
import {ArrowLeft,Download,Headphones,LoaderCircle} from 'lucide-react';
import {getAccessToken} from '../authClient';
import {exportAudioAsMp3} from '../shared/mp3Export';

/** Private landing page for links exported to Google Sheets, CSV and Excel. */
export function AudioPlaybackPage(){
 const {id}=useParams<{id:string}>();
 const [audio,setAudio]=useState<{url:string;blob:Blob}|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[downloading,setDownloading]=useState(false);
 useEffect(()=>{
  let active=true,url:string|null=null;
  void (async()=>{
   try{
    if(!id||!/^[0-9a-f-]{36}$/i.test(id))throw Error('Identifiant audio incorrect.');
    const token=await getAccessToken();if(!token)throw Error('Reconnectez-vous pour consulter cet enregistrement.');
    const res=await fetch('/api/audio/'+id,{headers:{Authorization:'Bearer '+token},cache:'no-store'});
    if(!res.ok)throw Error(res.status===403||res.status===404?'Enregistrement introuvable ou accès non autorisé.':'Audio temporairement indisponible.');
    const blob=await res.blob();if(!active)return;
    url=URL.createObjectURL(blob);setAudio({url,blob});
   }catch(e){if(active)setError(e instanceof Error?e.message:'Lecture indisponible.');}
   finally{if(active)setLoading(false);}
  })();
  return()=>{active=false;if(url)URL.revokeObjectURL(url);};
 },[id]);
 async function download(){
  if(!audio||!id||downloading)return;
  setDownloading(true);setError('');
  try{
   const mp3=await exportAudioAsMp3(audio.blob);
   const url=URL.createObjectURL(mp3),a=document.createElement('a');
   a.href=url;a.download='enregistrement-'+id.slice(0,8)+'.mp3';document.body.append(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),1500);
  }catch(e){setError(e instanceof Error?e.message:'Conversion MP3 impossible.');}
  finally{setDownloading(false);}
 }
 return <main className="mx-auto max-w-2xl px-5 py-12 text-[#294936]">
  <Link to="/studio" className="inline-flex items-center gap-2 text-sm font-semibold text-[#356e4b]"><ArrowLeft size={16}/> Retour à mes formulaires</Link>
  <section className="mt-8 rounded-2xl border border-[#dce9dd] bg-white p-6 sm:p-9">
   <h1 className="flex items-center gap-3 font-display text-2xl font-bold"><Headphones/> Écouter l’enregistrement</h1>
   <p className="mt-2 text-sm text-[#6d8173]">L’accès à cet audio exige une connexion autorisée à Monk Form. Le fichier n’est pas rendu public.</p>
   {loading&&<p role="status" className="mt-8 flex items-center gap-2 text-sm"><LoaderCircle className="animate-spin" size={17}/> Chargement de l’audio…</p>}
   {error&&<p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
   {audio&&<div className="mt-7 space-y-5">
    <audio aria-label="Enregistrement de la participation" controls preload="metadata" className="w-full" src={audio.url}/>
    <button type="button" disabled={downloading} onClick={()=>void download()}
     className="inline-flex items-center gap-2 rounded-xl bg-[#2f6546] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
     {downloading?<LoaderCircle className="animate-spin" size={16}/>:<Download size={16}/>}
     {downloading?'Conversion en cours…':'Télécharger le MP3'}
    </button>
   </div>}
  </section>
 </main>;
}
