import { useEffect,useRef,useState } from 'react';
import { Mic,StopCircle,RotateCcw,Trash2,UploadCloud,AlertCircle } from 'lucide-react';
import { audioMimeTypes,MAX_AUDIO_BYTES,MAX_AUDIO_SECONDS,normalizedMime,type AudioDraft } from '../shared/audio';

const preferred=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus','audio/ogg'];
export function chooseRecorderMime(support:(value:string)=>boolean){return preferred.find(support)??'';}
const extensionMime=(name:string)=>name.toLowerCase().endsWith('.m4a')?'audio/mp4':name.toLowerCase().endsWith('.mp3')?'audio/mpeg':name.toLowerCase().endsWith('.wav')?'audio/wav':name.toLowerCase().endsWith('.ogg')?'audio/ogg':name.toLowerCase().endsWith('.webm')?'audio/webm':'';
export function AudioRecorder({value,onChange,maxSeconds=180,maxBytes=MAX_AUDIO_BYTES,disabled=false}:{value?:AudioDraft;onChange:(v:AudioDraft|undefined)=>void;maxSeconds?:number;maxBytes?:number;disabled?:boolean}){
 const [state,setState]=useState<'idle'|'permission'|'recording'|'done'>('idle');
 const [seconds,setSeconds]=useState(0);const [error,setError]=useState('');
 const [url,setUrl]=useState('');const timer=useRef<ReturnType<typeof setInterval>|null>(null);
 const recorder=useRef<MediaRecorder|null>(null);const stream=useRef<MediaStream|null>(null);
 const chunks=useRef<Blob[]>([]);const started=useRef(0);
 const pending=useRef(false);const onchange=useRef(onChange);onchange.current=onChange;
 function freeStream(){stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;}
 function clearTimer(){if(timer.current)clearInterval(timer.current);timer.current=null;}
 useEffect(()=>{
  if(!value){setUrl(old=>{if(old)URL.revokeObjectURL(old);return ''});return;}
  const next=URL.createObjectURL(value.file);
  setUrl(old=>{if(old)URL.revokeObjectURL(old);return next});
  return()=>URL.revokeObjectURL(next);
 },[value]);
 useEffect(()=>()=>{pending.current=false;clearTimer();const r=recorder.current;if(r&&r.state==='recording')r.stop();freeStream();},[]);
 function stop(){clearTimer();if(recorder.current?.state==='recording')recorder.current.stop();freeStream();}
 async function start(){
  setError('');if(disabled)return;
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){setError('Ce navigateur ne peut pas enregistrer : importez un fichier audio.');return;}
  setState('permission');pending.current=true;
  try{
   const local=await navigator.mediaDevices.getUserMedia({audio:true});
   if(!pending.current){local.getTracks().forEach(t=>t.stop());return;}
   stream.current=local;chunks.current=[];const mime=chooseRecorderMime(m=>MediaRecorder.isTypeSupported(m));
   const rec=new MediaRecorder(local,mime?{mimeType:mime}:undefined);recorder.current=rec;
   rec.ondataavailable=e=>{if(e.data.size)chunks.current.push(e.data)};
   rec.onerror=()=>{setError('Enregistrement interrompu. Réessayez ou importez un fichier.');stop();setState('idle')};
   rec.onstop=()=>{
    clearTimer();freeStream();
    if(!pending.current)return;
    const duration=Math.max(1000,Date.now()-started.current);
    const rawType=normalizedMime(rec.mimeType||mime||'');
    const type=audioMimeTypes.find(t=>t===rawType);
    if(!type){setError('Format non pris en charge. Importez un fichier audio.');setState('idle');return;}
    const file=new Blob(chunks.current,{type});
    if(!file.size||file.size>maxBytes||duration>maxSeconds*1000+1500){setError('Enregistrement trop long ou trop volumineux.');setState('idle');return;}
    onchange.current({kind:'audio-draft',file,durationMs:Math.min(duration,maxSeconds*1000)});setState('done');
   };
   local.getTracks().forEach(track=>track.addEventListener('ended',()=>{
    setError('Le microphone a été déconnecté. Réécoutez votre enregistrement avant de continuer.');
    if(rec.state==='recording')rec.stop();
   },{once:true}));
   rec.start(1000);started.current=Date.now();setSeconds(0);setState('recording');
   timer.current=setInterval(()=>{const n=Math.floor((Date.now()-started.current)/1000);setSeconds(n);if(n>=maxSeconds)stop();},300);
  }catch(e){freeStream();setState('idle');setError(e instanceof DOMException&&e.name==='NotAllowedError'?'Microphone refusé : autorisez-le dans votre navigateur, ou importez un fichier.':'Microphone indisponible. Importez un fichier audio.');}
 }
 async function importFile(file?:File){if(!file)return;setError('');
  const mime=normalizedMime(file.type)||extensionMime(file.name);
  if(!audioMimeTypes.some(t=>t===mime)){setError('Formats acceptés : WebM, OGG, MP4/M4A, MP3, WAV, AAC.');return;}
  if(!file.size||file.size>maxBytes){setError(`Fichier trop volumineux. Limite : ${Math.round(maxBytes/1024/1024)} Mo.`);return;}
  // File imports do not have a trustworthy client duration; decode metadata when available.
  try{
   const objectUrl=URL.createObjectURL(file);
   const duration=await new Promise<number>((resolve,reject)=>{
    const audio=document.createElement('audio');const timeout=setTimeout(()=>{audio.src='';reject(new Error('timeout'));},10000);
    audio.preload='metadata';audio.onloadedmetadata=()=>{clearTimeout(timeout);const seconds=audio.duration;audio.src='';Number.isFinite(seconds)&&seconds>0?resolve(seconds):reject(new Error('duration'));};
    audio.onerror=()=>{clearTimeout(timeout);audio.src='';reject(new Error('unsupported'));};audio.src=objectUrl;
   }).finally(()=>URL.revokeObjectURL(objectUrl));
   if(duration>maxSeconds){setError(`Cet audio dépasse la limite de ${maxSeconds} secondes.`);return;}
   onchange.current({kind:'audio-draft',file:new Blob([file],{type:mime}),durationMs:Math.max(1,Math.ceil(duration*1000))});setState('done');
  }catch{setError('Impossible de lire la durée de ce fichier. Convertissez-le dans un format audio pris en charge.');}
 }
 const reset=()=>{pending.current=false;stop();onChange(undefined);setSeconds(0);setState('idle');setError('');};
 return <div className="audio-recorder rounded-[22px] border border-[#dce9dd] bg-[#f4f9f3] p-5" aria-label="Réponse vocale">
  <div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-[.12em] text-[#6b9375]">Enregistrement vocal</span><span className="font-mono text-sm text-[#50765b]">{String(Math.floor((state==='recording'?seconds:(value?.durationMs??0)/1000)/60)).padStart(2,'0')}:{String(Math.floor((state==='recording'?seconds:(value?.durationMs??0)/1000)%60)).padStart(2,'0')}</span></div>
  {state==='recording'?<div className="space-y-4"><div className="flex items-center justify-center gap-3 text-sm font-medium text-[#aa6054]"><span className="h-3 w-3 animate-pulse rounded-full bg-[#d56c5b]"/>Enregistrement en cours</div><div className="audio-wave text-[#c86c5b]" aria-hidden="true">{Array.from({length:19},(_,i)=><span key={i}/>)}</div><button type="button" disabled={disabled} onClick={stop} className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#d16a59] text-white shadow-md focus-visible:ring-4 focus-visible:ring-[#efc4be]" aria-label="Arrêter l’enregistrement"><StopCircle size={38}/></button></div>:
   <div className="flex flex-col items-center gap-3">
    {value&&url?<><audio className="w-full" aria-label="Réécouter votre réponse" controls preload="metadata" src={url}/><div className="flex gap-2"><button type="button" onClick={reset} disabled={disabled} className="inline-flex gap-2 rounded-xl border border-[#ccdfcf] bg-white px-4 py-2 text-sm text-[#526e59]"><Trash2 size={16}/> Supprimer</button><button type="button" onClick={()=>{onChange(undefined);setState('idle');}} disabled={disabled} className="inline-flex gap-2 rounded-xl bg-[#e3f0e4] px-4 py-2 text-sm text-[#3e7050]"><RotateCcw size={16}/> Recommencer</button></div></>:
     <button type="button" disabled={disabled||state==='permission'} onClick={()=>void start()} className="flex h-20 w-20 items-center justify-center rounded-full bg-[#317350] text-white shadow-md transition hover:scale-[1.03] focus-visible:ring-4 focus-visible:ring-[#b9dabe]" aria-label="Commencer l’enregistrement"><Mic size={35}/></button>}
    {!value&&<p className="text-center text-sm text-[#68826e]">{state==='permission'?'Autorisez l’accès au microphone…':'Touchez le micro pour répondre à l’oral.'}</p>}
   </div>}
  <label className="mt-5 flex cursor-pointer items-center justify-center gap-2 border-t border-[#dae9da] pt-4 text-sm text-[#4b7c59]"><UploadCloud size={17}/> Importer un fichier à la place<input aria-label="Importer un fichier audio" type="file" accept="audio/*,.webm,.m4a,.ogg,.mp3,.wav,.aac" className="sr-only" disabled={disabled||state==='recording'} onChange={e=>{void importFile(e.target.files?.[0]);e.target.value='';}}/></label>
  {error&&<p role="alert" className="mt-3 flex items-start gap-2 text-sm text-[#aa6054]"><AlertCircle size={17}/>{error}</p>}
  <p className="mt-3 text-center text-xs text-[#8fa492]">Maximum {Math.round(maxSeconds/60*10)/10} min · {Math.round(maxBytes/1048576)} Mo. L’audio reste sur cet appareil jusqu’à l’envoi.</p>
 </div>;
}
