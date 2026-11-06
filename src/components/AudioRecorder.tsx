import { useEffect,useRef,useState } from 'react';
import { Mic,Square,RotateCcw,Upload,AlertCircle } from 'lucide-react';
import { audioMimeTypes,MAX_AUDIO_BYTES,normalizedMime,type AudioDraft } from '../shared/audio';

const formats=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus','audio/ogg'];
export function chooseRecorderMime(supported:(s:string)=>boolean){return formats.find(supported)??'';}
export function AudioRecorder({value,onChange,maxSeconds=600,maxBytes=MAX_AUDIO_BYTES}:{
 value?:AudioDraft;onChange:(value:AudioDraft|undefined)=>void;maxSeconds?:number;maxBytes?:number;
}){
 const [recording,setRecording]=useState(false),[seconds,setSeconds]=useState(0),[error,setError]=useState('');
 const [url,setUrl]=useState('');
 const media=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null);
 const timer=useRef<ReturnType<typeof setInterval>|null>(null);
 const started=useRef(0),blobs=useRef<Blob[]>([]);
 const listener=useRef(onChange);listener.current=onChange;
 function stop(){if(media.current?.state==='recording')media.current.stop();}
 function free(){
  if(timer.current)clearInterval(timer.current);timer.current=null;
  stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;
 }
 useEffect(()=>{
  if(!value){setUrl('');return;}
  const next=URL.createObjectURL(value.file);setUrl(next);
  return ()=>URL.revokeObjectURL(next);
 },[value?.file]);
 useEffect(()=>()=>{stop();free();},[]);
 async function start(){
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){
   setError('Le microphone n’est pas disponible dans ce navigateur. Tu peux importer un audio.');return;
  }
  setError('');
  try{
   const s=await navigator.mediaDevices.getUserMedia({audio:true});stream.current=s;
   const preferred=chooseRecorderMime(m=>MediaRecorder.isTypeSupported(m));
   const rec=new MediaRecorder(s,{...(preferred?{mimeType:preferred}:{}),audioBitsPerSecond:64000});
   media.current=rec;blobs.current=[];
   rec.ondataavailable=e=>{if(e.data.size)blobs.current.push(e.data)};
   rec.onstop=()=>{
    free();setRecording(false);
    const mime=normalizedMime(rec.mimeType||preferred);
    if(!audioMimeTypes.some(t=>t===mime)){setError('Format audio non pris en charge.');return;}
    const file=new Blob(blobs.current,{type:mime});
    const duration=Math.max(1000,Date.now()-started.current);
    if(!file.size||file.size>maxBytes){setError('Fichier audio trop volumineux.');return;}
    listener.current({kind:'audio-draft',file,durationMs:Math.min(duration,maxSeconds*1000)});
   };
   rec.onerror=()=>{free();setRecording(false);setError('Enregistrement interrompu.');};
   started.current=Date.now();setSeconds(0);rec.start(1000);setRecording(true);
   timer.current=setInterval(()=>{
    const elapsed=Math.floor((Date.now()-started.current)/1000);setSeconds(elapsed);
    if(elapsed>=maxSeconds)stop();
   },400);
  }catch{
   free();setError('Accès au microphone refusé ou indisponible. Vérifie les autorisations.');
  }
 }
 async function imported(file:File|undefined){
  if(!file)return;
  const mime=normalizedMime(file.type)||(
    /\.m4a$/i.test(file.name)?'audio/mp4':/\.mp3$/i.test(file.name)?'audio/mpeg':
    /\.wav$/i.test(file.name)?'audio/wav':/\.ogg$/i.test(file.name)?'audio/ogg':'');
  if(!audioMimeTypes.some(t=>t===mime)||!file.size||file.size>maxBytes){
   setError('Fichier invalide ou trop volumineux. Formats : WebM, MP4, M4A, OGG, MP3, WAV.');return;
  }
  try{
   const object=URL.createObjectURL(file);
   const duration=await new Promise<number>((resolve,reject)=>{
    const a=new Audio(),timer=setTimeout(()=>reject(new Error('timeout')),10000);
    a.preload='metadata';a.onloadedmetadata=()=>{clearTimeout(timer);resolve(a.duration)};
    a.onerror=()=>{clearTimeout(timer);reject(new Error('invalid'))};a.src=object;
   }).finally(()=>URL.revokeObjectURL(object));
   if(!Number.isFinite(duration)||duration<0||duration>maxSeconds)throw new Error('duration');
   listener.current({kind:'audio-draft',file:new Blob([file],{type:mime}),durationMs:Math.max(1,Math.round(duration*1000))});
   setError('');
  }catch{setError('Impossible de vérifier la durée audio ou durée trop longue.');}
 }
 return <div className="rounded-2xl border border-[#dce9dd] bg-[#f4f9f3] p-4">
  <div className="flex items-center justify-between gap-2">
   <span className="text-sm font-semibold text-[#315c3f]">Réponse vocale</span>
   <span className="text-sm tabular-nums">{Math.floor((recording?seconds:(value?.durationMs??0)/1000)/60)}:{String(Math.floor((recording?seconds:(value?.durationMs??0)/1000)%60)).padStart(2,'0')}</span>
  </div>
  <div className="mt-4 flex flex-wrap items-center gap-3">
   {recording?
    <button type="button" aria-label="Arrêter l’enregistrement" onClick={stop} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-3 font-semibold text-white"><Square size={17}/> Arrêter</button>:
    !value&&<button type="button" aria-label="Commencer l’enregistrement" onClick={()=>void start()} className="inline-flex items-center gap-2 rounded-xl bg-[#2d704d] px-4 py-3 font-semibold text-white"><Mic size={18}/> Enregistrer</button>}
   {value&&!recording&&<button type="button" onClick={()=>{onChange(undefined);setError('');}} className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm"><RotateCcw size={16}/> Recommencer</button>}
  </div>
  {value&&url&&<audio className="mt-4 w-full" controls src={url} preload="metadata" aria-label="Écouter votre réponse"/>}
  <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-[#316048]"><Upload size={17}/> Importer un fichier audio
   <input aria-label="Importer un audio" className="sr-only" type="file" accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg" onChange={e=>{void imported(e.target.files?.[0]);e.target.value='';}}/>
  </label>
  {error&&<p role="alert" className="mt-3 flex items-center gap-2 text-sm text-red-700"><AlertCircle size={17}/>{error}</p>}
 </div>;
}
