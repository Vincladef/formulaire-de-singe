import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import { sanitizeDocumentHtml } from '../shared/richText';
import { evaluateLogic } from '../shared/conditionalLogic';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, CircleAlert, ExternalLink, FileQuestion, LoaderCircle } from 'lucide-react';
import { AudioRecorder } from '../components/AudioRecorder';
import { audioMode, type AudioDraft, type UploadedAudio, DIRECT_AUDIO_BYTES } from '../shared/audio';
import { type AnswerValues, type PublicForm, type PublicQuestion, toSubmissionAnswers, validateAnswers, isAnswered, OTHER_VALUE, isOtherAnswer } from '../shared/publicForm';

type ApiResult<T>={ok:true;data:T}|{ok:false;error:{code:string;message:string}};
const fieldStyle='w-full rounded-2xl border border-[#dce7dc] bg-white px-4 py-3.5 text-[#294735] outline-none transition focus:border-[#5b986e] focus:ring-4 focus:ring-[#e0eee0]';
const solid='inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--monk-accent)] px-6 py-3.5 font-semibold text-white shadow-sm transition hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-60';

async function getPublic(slug:string,signal:AbortSignal):Promise<PublicForm>{
 const response=await fetch(`/api/public/forms/${encodeURIComponent(slug)}`,{signal,headers:{Accept:'application/json'},cache:'no-store'});
 const payload=await response.json() as ApiResult<PublicForm>;
 if(!payload.ok)throw new Error(payload.error.message);
 return payload.data;
}
/** A failed chunk may have been stored already; the server accepts exact-part retries. */
async function sendAudioChunk(url:string,options:RequestInit):Promise<void>{
 for(let attempt=0;attempt<3;attempt++){
  let response:Response|undefined;
  try{response=await fetch(url,options);}
  catch(error){if(attempt===2)throw error;}
  if(response?.ok)return;
  if(response&&!([408,425,429,500,502,503,504].includes(response.status)))
   throw new Error('Envoi audio refusé ('+response.status+').');
  if(attempt===2)throw new Error('Transfert audio interrompu. Réessayez.');
  await new Promise<void>(resolve=>setTimeout(resolve,350*2**attempt));
 }
}

type ChoiceCard={imageSrc?:string;date?:string;venue?:string;summary?:string;url?:string;price?:string;priceNote?:string};
function readChoiceCards(settings:PublicQuestion['settings']):Record<string,ChoiceCard>{
 const raw=settings?.choiceCards;
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
 const results:Record<string,ChoiceCard>={};
 for(const [key,entry] of Object.entries(raw)){
  if(!entry||typeof entry!=='object'||Array.isArray(entry))continue;
  const o=entry as Record<string,unknown>;
  const imageSrc=typeof o.imageSrc==='string'&&
    (/^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(o.imageSrc)||/^https:\/\//.test(o.imageSrc))
    ?o.imageSrc:undefined;
  const url=typeof o.url==='string'&&/^https:\/\//.test(o.url)?o.url:undefined;
  results[key]={
   imageSrc,url,
   date:typeof o.date==='string'?o.date.slice(0,120):undefined,
   venue:typeof o.venue==='string'?o.venue.slice(0,160):undefined,
   summary:typeof o.summary==='string'?o.summary.slice(0,600):undefined,
   price:typeof o.price==='string'?o.price.slice(0,80):undefined,
   priceNote:typeof o.priceNote==='string'?o.priceNote.slice(0,200):undefined,
  };
 }
 return results;
}

export function QuestionField({question,value,onChange,error,audioStatus}: {question:PublicQuestion;value:AnswerValues[string];onChange:(value:AnswerValues[string])=>void;error?:string;audioStatus?:'uploading'|'ready'|'error'}){
 const describedBy=`description-${question.id}`;
 const errorId=`error-${question.id}`;
 const ariaDesc=[question.description?describedBy:null,error?errorId:null].filter(Boolean).join(' ')||undefined;
 const options=question.options;
 const choiceCards=question.type==='multiple_choice'?readChoiceCards(question.settings):{};
 const hasChoiceCards=options.some(option=>choiceCards[option.value]?.imageSrc);
 const otherValue=typeof value==='string'&&isOtherAnswer(value)?value:Array.isArray(value)?value.find(isOtherAnswer):undefined;
 const otherSelected=otherValue!==undefined;
 const otherText=otherSelected?otherValue.slice(OTHER_VALUE.length+1):'';
 const mode=question.mode??audioMode(question.type);
 const [preferAudio,setPreferAudio]=useState(false);
 const vocal=mode==='audio'||(mode==='either'&&preferAudio);
 const draft=value&&typeof value==='object'&&!Array.isArray(value)&&value.kind==='audio-draft'?value:undefined;
 const audioWithText=question.type==='audio'&&question.settings?.allowTextSupplement===true;
 const supplement=typeof value==='string'?value:value&&typeof value==='object'&&!Array.isArray(value)?value.text??'':'';
 const [textExpanded,setTextExpanded]=useState(Boolean(supplement));
 const common={id:question.id,'aria-invalid':!!error,'aria-describedby':ariaDesc,required:question.required} as const;
 return <div className={question.type==='statement'?'px-1 py-2 sm:px-3':'rounded-2xl border border-[#e1e9df] bg-[var(--monk-surface)] p-5 sm:p-7'}>
  {question.type==='statement' ? <>
   <h3 className={question.settings?.textStyle==='heading'?'font-display text-2xl font-bold leading-snug text-[#294a34]':question.settings?.textStyle==='quote'?'border-l-[3px] border-[#a8c4aa] pl-4 text-base italic leading-7 text-[#647c69]':'whitespace-pre-line text-[15px] font-normal leading-8 text-[#526c59]'}>{typeof question.settings?.richHtml==='string'?<span dangerouslySetInnerHTML={{__html:sanitizeDocumentHtml(question.settings.richHtml)}}/>:question.label}</h3>
   {question.description&&<p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-[#607265]">{question.description}</p>}
  </> : <>
   <label htmlFor={question.id} className="font-display mb-2 block text-[17px] font-bold leading-snug text-[#294a34]">
    {question.label} {question.required ? <span aria-label="obligatoire" className="text-[#a44f3b]">*</span> : null}
   </label>
   {question.description&&<p id={describedBy} className="mb-4 whitespace-pre-line text-sm leading-6 text-[#607265]">{question.description}</p>}
   <div className={question.description?'mt-3':'mt-4'}>
    {mode==='either'&&<div className="mb-4 flex gap-2" role="group" aria-label="Type de réponse">
     <button type="button" className="rounded-lg border px-3 py-2 text-sm" aria-pressed={!preferAudio} onClick={()=>{setPreferAudio(false);onChange(undefined);}}>Écrire</button>
     <button type="button" className="rounded-lg border px-3 py-2 text-sm" aria-pressed={preferAudio} onClick={()=>{setPreferAudio(true);onChange(undefined);}}>Parler</button>
    </div>}
    {!vocal&&question.type==='short_text'&&<input {...common} className={fieldStyle} type="text" maxLength={500} placeholder="Votre réponse…" value={typeof value==='string'?value:''} onChange={e=>onChange(e.target.value)}/>}
    {!vocal&&question.type==='long_text'&&<textarea {...common} className={fieldStyle+' min-h-32 resize-y'} rows={4} maxLength={10000} placeholder="Racontez-nous…" value={typeof value==='string'?value:''} onChange={e=>onChange(e.target.value)}/>}
    {question.type==='number'&&<input {...common} className={fieldStyle} type="number" placeholder="0" value={typeof value==='number'&&Number.isFinite(value)?value:''} onChange={e=>onChange(e.target.value===''?undefined:Number(e.target.value))}/>}
    {question.type==='date'&&<input {...common} className={fieldStyle} type="date" value={typeof value==='string'?value:''} onChange={e=>onChange(e.target.value)}/>}
    {question.type==='select'&&<select {...common} className={fieldStyle} value={typeof value==='string'?(otherSelected?OTHER_VALUE:value):''} onChange={e=>onChange(e.target.value===OTHER_VALUE?OTHER_VALUE+':':e.target.value)}>
      <option value="">Choisir une réponse…</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
    </select>}
    {question.type==='single_choice'&&<fieldset aria-describedby={ariaDesc} aria-invalid={!!error} className="space-y-2">
      <legend className="sr-only">{question.label}</legend>
      {options.map(o=><label key={o.value} className={'flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3.5 text-sm transition '+((o.value===OTHER_VALUE?otherSelected:value===o.value)?'border-[#7eab87] bg-[#eff7ed] text-[#2c6041]':'border-[#e0e9de] hover:bg-[#f7faf5]')}>
        <input type="radio" name={question.id} checked={o.value===OTHER_VALUE?otherSelected:value===o.value} value={o.value} onChange={()=>onChange(o.value===OTHER_VALUE?OTHER_VALUE+':':o.value)} className="h-4 w-4 accent-[#33764c]"/>{o.label}
      </label>)}
    </fieldset>}
    {question.type==='multiple_choice'&&<fieldset aria-describedby={ariaDesc} aria-invalid={!!error} className={hasChoiceCards?'grid grid-cols-1 gap-5':'space-y-2'}>
      <legend className="sr-only">{question.label}</legend>
      {options.map(o=>{const checked=Array.isArray(value)&&(o.value===OTHER_VALUE?value.some(isOtherAnswer):value.includes(o.value));
        const card=choiceCards[o.value];
        const toggle=(on:boolean)=>onChange(on?[...(Array.isArray(value)?value:[]),o.value===OTHER_VALUE?OTHER_VALUE+':':o.value]:(Array.isArray(value)?value:[]).filter(v=>o.value===OTHER_VALUE?!isOtherAnswer(v):v!==o.value));
        if(hasChoiceCards&&card)return <div key={o.value} className={'min-w-0 overflow-hidden rounded-[23px] border-2 transition-colors '+(checked?'border-[#438257] bg-[#f0f8ef] shadow-md':'border-[#dce8dc] bg-white hover:border-[#9dc5a6]')}>
          <label className="grid cursor-pointer grid-cols-1 sm:grid-cols-[minmax(0,40%)_minmax(0,1fr)]">
           {card.imageSrc&&<img loading="lazy" decoding="async" src={card.imageSrc} alt={'Illustration de '+o.label} className="aspect-[16/9] h-full min-h-[170px] w-full bg-[#edf3eb] object-cover"/>}
           <span className="flex min-w-0 flex-col gap-3 p-5 sm:px-6 sm:py-5">
            <span className="flex items-start gap-3">
             <input type="checkbox" checked={checked} onChange={e=>toggle(e.target.checked)} aria-label={'Choisir '+o.label} className="mt-1 h-[22px] w-[22px] shrink-0 accent-[#33764c]"/>
             <span className="min-w-0 text-lg font-bold leading-snug text-[#264c35]">{o.label}</span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
             <span className="rounded-full bg-[#e4f3e5] px-3 py-1 text-xs font-bold text-[#28633c]">{card.price||'Tarif à vérifier'}</span>
             {card.priceNote&&<span className="text-xs leading-5 text-[#718372]">{card.priceNote}</span>}
            </span>
            {(card.date||card.venue)&&<span className="text-sm font-medium leading-relaxed text-[#456851]">{[card.date,card.venue].filter(Boolean).join(' · ')}</span>}
            {card.summary&&<span className="text-[14px] leading-[1.7] text-[#536b5a]">{card.summary}</span>}
           </span>
          </label>
          {card.url&&<div className="border-t border-[#e6eee5] px-5 py-3 sm:pl-[calc(40%+1.5rem)]">
           <a href={card.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#2e7453] underline underline-offset-2">
            Voir le programme et réserver <ExternalLink size={14} aria-hidden="true"/>
           </a>
          </div>}
         </div>;
        return <label key={o.value} className={'flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3.5 text-sm transition '+(checked?'border-[#7eab87] bg-[#eff7ed] text-[#2c6041]':'border-[#e0e9de] hover:bg-[#f7faf5]')}>
         <input type="checkbox" checked={checked} onChange={e=>toggle(e.target.checked)} className="h-4 w-4 accent-[#33764c]"/>{o.label}
        </label>;
      })}
    </fieldset>}
    {!vocal&&otherSelected&&<input className={fieldStyle+' mt-3'} aria-label="Précisez votre réponse Autre"
        placeholder="Précisez votre réponse…" maxLength={300} value={otherText}
        onChange={e=>{const next=OTHER_VALUE+':'+e.target.value;
         onChange(Array.isArray(value)?[...value.filter(v=>!isOtherAnswer(v)),next]:next);
        }}/>}
    {vocal&&<AudioRecorder value={draft} onChange={next=>onChange(next?(audioWithText&&supplement?{...next,text:supplement}:next):(audioWithText?supplement||undefined:undefined))} maxSeconds={question.maxAudioSeconds??600} maxBytes={question.maxAudioBytes??15*1048576}
      supplementControl={audioWithText?<button type="button" aria-expanded={textExpanded} aria-controls={`supplement-${question.id}`}
        aria-label={textExpanded?'Masquer le texte facultatif':'Afficher le texte facultatif'}
        onClick={()=>setTextExpanded(open=>!open)}
        className="inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-xs text-[#557962] hover:bg-[#e4efe4] focus-visible:outline-2 focus-visible:outline-[#45865a]">
        <ChevronDown size={13} className={`transition-transform ${textExpanded?'rotate-180':''}`}/>
        <span>Texte</span>{!textExpanded&&supplement&&<span aria-label="Texte renseigné" className="h-1.5 w-1.5 rounded-full bg-[#3a8054]"/>}
      </button>:undefined}/>}
    {vocal&&draft&&audioStatus&&<p role="status" className="mt-2 text-xs text-[#607265]">{audioStatus==='ready'?'Audio prêt pour l’envoi.':audioStatus==='uploading'?'Transfert sécurisé de l’audio en cours…':'Transfert interrompu ; une nouvelle tentative aura lieu lors de l’envoi.'}</p>}
    {audioWithText&&<div id={`supplement-${question.id}`} hidden={!textExpanded} className="mt-2">
      <label htmlFor={`supplement-input-${question.id}`} className="sr-only">Réponse écrite complémentaire</label>
      <textarea id={`supplement-input-${question.id}`} className="min-h-16 w-full resize-y rounded-xl border border-[#dce7dc] bg-white px-3 py-2 text-sm text-[#294735] outline-none focus:border-[#5b986e] focus:ring-2 focus:ring-[#e0eee0]" rows={2} maxLength={500}
        placeholder="Ajouter quelques mots (facultatif)…"
        value={supplement} onChange={e=>{const text=e.target.value;
          onChange(value&&typeof value==='object'&&!Array.isArray(value)?{...value,text}:text||undefined);
        }}/>
    </div>}
   </div>
   {error&&<p id={errorId} role="alert" className="mt-3 flex items-start gap-2 text-sm font-medium text-[#ad5e4e]"><CircleAlert size={16} className="mt-0.5 shrink-0"/>{error}</p>}
  </>}
 </div>;
}

export function PublicFormPage(){
 const {slug=''}=useParams<{slug:string}>();
 const [form,setForm]=useState<PublicForm|null>(null);
 const [loading,setLoading]=useState(true);
 useEffect(()=>{if(!form)return;
  const previous=document.title;
  const description=document.querySelector('meta[name="description"]');
  const oldDescription=description?.getAttribute('content')??null;
  document.title=`${form.title} | Questionnaire`;
  description?.setAttribute('content',form.description||`Répondre au questionnaire : ${form.title}`);
  return()=>{document.title=previous;if(description&&oldDescription!==null)description.setAttribute('content',oldDescription);};
 },[form]);
 const [error,setError]=useState('');
 const [pageIndex,setPageIndex]=useState(0);
 const [answers,setAnswers]=useState<AnswerValues>({});
 const [errors,setErrors]=useState<Record<string,string>>({});
  
  
 const [submitting,setSubmitting]=useState(false);
 const [uploadStates,setUploadStates]=useState<Record<string,'uploading'|'ready'|'error'>>({});
 const uploadTasksRef=useRef(new Map<string,{file:Blob;promise:Promise<UploadedAudio>}>());
 const attemptedUploadsRef=useRef(new Map<string,Blob>());
 const [submitted,setSubmitted]=useState(false);
  
 const nonceRef=useRef(crypto.randomUUID());
 const inFlightRef=useRef(false);
 useEffect(()=>{
  const controller=new AbortController();
  setForm(null);setLoading(true);setError('');setPageIndex(0);setAnswers({}); setSubmitted(false); setErrors({});nonceRef.current=crypto.randomUUID();
  uploadTasksRef.current.clear();attemptedUploadsRef.current.clear();setUploadStates({});
  getPublic(slug,controller.signal).then(data=>{if(!controller.signal.aborted)setForm(data);}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Formulaire indisponible.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[slug]);
 const journey=form?evaluateLogic(form.pages,answers):null;
 const availablePages=journey?.pageIndices??[];
 const page=form?.pages[pageIndex];
 const visualChoices=form?.pages.flatMap(p=>p.questions).find(q=>q.type==='multiple_choice'&&q.settings?.choiceCards);
 const selectedVisual=visualChoices&&Array.isArray(answers[visualChoices.id])?(answers[visualChoices.id] as string[]).length:0;
 const totalQuestions=form?.pages.flatMap(p=>p.questions.filter(q=>q.type!=='statement'&&journey?.visibleIds.has(q.id)))??[];
 const answeredCount=totalQuestions.filter(q=>isAnswered(answers[q.id])).length;
 const progress=totalQuestions.length?Math.round(answeredCount/totalQuestions.length*100):0;
 const appearance=form?.appearance;
 const themeStyle={
  '--monk-accent':appearance?.accent??'#286846',
  '--monk-surface':appearance?.surface??'#ffffff',
  '--monk-text':appearance?.text??'#254632',
  backgroundColor:appearance?.background??'#fafcf8',
  fontFamily:appearance?.font==='serif'?'Georgia, serif':appearance?.font==='system'?'system-ui, sans-serif':undefined,
 } as CSSProperties;
 const previousPage=availablePages.filter(i=>i<pageIndex).at(-1);
 const nextPage=availablePages.find(i=>i>pageIndex);
 useEffect(()=>{
  if(!form)return;
  const indices=evaluateLogic(form.pages,answers).pageIndices;
  if(!indices.length||indices.includes(pageIndex))return;
  setPageIndex(indices.find(i=>i>pageIndex)??indices.at(-1)??0);
 },[form,pageIndex,answers]);
 function setAnswer(id:string,value:AnswerValues[string]){setAnswers(prev=>({...prev,[id]:value}));setErrors(prev=>{const n={...prev};delete n[id];return n;});}
 function validatePage(){if(!form||!page)return false;
  const issues=validateAnswers(form,answers);
  const current=new Set(page.questions.map(q=>q.id));
  const issue=Object.fromEntries(Object.entries(issues).filter(([id])=>current.has(id)));
  setErrors(issue);
  if(Object.keys(issue).length){document.getElementById(Object.keys(issue)[0])?.focus();return false;}
  return true;
 }
 function next(){if(!validatePage()||nextPage===undefined)return;setPageIndex(nextPage);window.scrollTo?.({top:0,behavior:'smooth'});}
 const uploadDraft=useCallback(async(questionId:string,draft:AudioDraft,currentForm:PublicForm):Promise<UploadedAudio>=>{
  const previous=uploadTasksRef.current.get(questionId);
  if(previous?.file===draft.file)return previous.promise;
  const promise=(async()=>{
   const api=`/api/public/forms/${encodeURIComponent(currentForm.slug)}/audio`;
   const clientNonce=nonceRef.current;
   if(draft.file.size<=DIRECT_AUDIO_BYTES){
    const direct=await fetch(`${api}/direct`,{
     method:'POST',headers:{'Content-Type':draft.file.type,
      'x-audio-version':currentForm.versionId,
      'x-audio-question':questionId,'x-audio-nonce':clientNonce,
      'x-audio-duration-ms':String(draft.durationMs)},
     body:draft.file,
    });
    // A client with a cached older deployment can still use multipart.
    if(direct.status!==404&&direct.status!==405){
     const result=await direct.json() as ApiResult<UploadedAudio>;
     if(!result.ok)throw new Error(result.error.message);
     return result.data;
    }
   }
   const prepare=await fetch(`${api}/prepare`,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({versionId:currentForm.versionId,questionId,clientNonce,
     mimeType:draft.file.type,byteSize:draft.file.size,durationMs:draft.durationMs})});
   const prep=await prepare.json() as ApiResult<{uploadId:string;claimToken:string;partBytes:number;partCount:number}>;
   if(!prep.ok)throw new Error(prep.error.message);
   const {uploadId,claimToken,partCount,partBytes}=prep.data;
   if(!Number.isInteger(partBytes)||partBytes<=0||partBytes>DIRECT_AUDIO_BYTES)
    throw new Error('Taille des portions audio invalide.');
   let nextPart=0;
   await Promise.all(Array.from({length:Math.min(3,partCount)},async()=>{
    while(nextPart<partCount){
     const i=nextPart++;
     const chunk=draft.file.slice(i*partBytes,Math.min((i+1)*partBytes,draft.file.size));
     await sendAudioChunk(`${api}/${uploadId}/parts/${i}`,{
      method:'POST',headers:{'Content-Type':'application/octet-stream',
       'x-audio-nonce':clientNonce,'x-audio-claim':claimToken},body:chunk,
     });
    }
   }));
   const finish=await fetch(`${api}/complete`,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({uploadId,claimToken,clientNonce})});
   const confirmed=await finish.json() as ApiResult<{verified:boolean}>;
   if(!confirmed.ok||!confirmed.data.verified)
    throw new Error(confirmed.ok?'Le fichier audio est incomplet.':confirmed.error.message);
   return {kind:'audio' as const,uploadId,claimToken};
  })();
  uploadTasksRef.current.set(questionId,{file:draft.file,promise});
  setUploadStates(s=>({...s,[questionId]:'uploading'}));
  void promise.then(()=>{
   if(uploadTasksRef.current.get(questionId)?.file===draft.file)setUploadStates(s=>({...s,[questionId]:'ready'}));
  },()=>{
   if(uploadTasksRef.current.get(questionId)?.file===draft.file){
    uploadTasksRef.current.delete(questionId);
    setUploadStates(s=>({...s,[questionId]:'error'}));
   }
  });
  return promise;
 },[]);
 // Prepare each recording as soon as it is completed, while the respondent fills in the form.
 useEffect(()=>{
  if(!form||submitted)return;
  const active=evaluateLogic(form.pages,answers);
  for(const [questionId,value] of Object.entries(answers)){
   if(!active.visibleIds.has(questionId))continue;
   if(value&&typeof value==='object'&&!Array.isArray(value)&&value.kind==='audio-draft'&&
     attemptedUploadsRef.current.get(questionId)!==value.file){
    attemptedUploadsRef.current.set(questionId,value.file);
    void uploadDraft(questionId,value,form).catch(()=>{});
   }
  }
 },[answers,form,submitted,uploadDraft]);
 async function send(){
  if(!form||inFlightRef.current)return;
  const issue=validateAnswers(form,answers);setErrors(issue);
  if(Object.keys(issue).length){const first=form.pages.findIndex(p=>p.questions.some(q=>issue[q.id]));if(first>=0)setPageIndex(first);setError('Certaines questions demandent une réponse.');return;}
  inFlightRef.current=true;setSubmitting(true);setError('');
  try{
   const readyValues:AnswerValues={...answers};
   const active=evaluateLogic(form.pages,readyValues);
   await Promise.all(Object.entries(readyValues).map(async([questionId,value])=>{
    if(!active.visibleIds.has(questionId))return;
    if(!value||typeof value!=='object'||Array.isArray(value)||value.kind!=='audio-draft')return;
    const ready=await uploadDraft(questionId,value,form);
    readyValues[questionId]=value.text?{...ready,text:value.text}:ready;
   }));
   const response=await fetch(`/api/public/forms/${encodeURIComponent(form.slug)}/submissions`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({versionId:form.versionId,clientNonce:nonceRef.current,website:'',answers:toSubmissionAnswers(form,readyValues)}),
   });
   const json=await response.json() as ApiResult<{id:string}>;
   if(!json.ok)throw new Error(json.error.message);
   setSubmitted(true);
  }catch(e){setError(e instanceof Error?e.message:'Envoi impossible. Veuillez réessayer.');}
  finally{inFlightRef.current=false;setSubmitting(false);}
 }
 if(loading)return <main className="mx-auto flex min-h-[65vh] max-w-2xl items-center justify-center px-5" role="status"><LoaderCircle className="animate-spin text-[#356944]" size={30}/><span className="ml-3 text-[#607265]">Chargement du questionnaire…</span></main>;
 if(!form)return <main className="mx-auto max-w-xl px-6 py-28 text-center"><FileQuestion className="mx-auto text-[#5d795f]" size={42}/><h1 className="mt-6 font-display text-3xl font-bold">Formulaire indisponible</h1><p className="mt-4 text-[#607265]">{error||'Ce questionnaire est introuvable ou n’a pas été publié.'}</p></main>;
 if(submitted)return <main className="mx-auto max-w-xl px-6 py-28 text-center" style={themeStyle} role="status"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#e4f4e4]"><CheckCircle2 size={44} className="text-[#397b51]"/></div><h1 className="mt-7 font-display text-4xl font-bold" style={{color:'var(--monk-text)'}}>{appearance?.thankYouTitle??'Merci pour votre participation !'}</h1><p className="mt-4 text-[#607265]">{appearance?.thankYouMessage??'Vos réponses ont bien été enregistrées. Vous pouvez fermer cette page.'}</p></main>;
 return <main className="min-h-[75vh] px-4 pb-24 pt-8 sm:px-7 sm:pt-14" style={themeStyle}>
  <div className="mx-auto max-w-[740px]">
   <div className="mb-8 flex items-center justify-between text-xs font-semibold uppercase tracking-[.12em] text-[#607265]"><span>Questionnaire</span><span>{availablePages.length<=1?`${answeredCount}/${totalQuestions.length} réponses`:`Étape ${availablePages.indexOf(pageIndex)+1} sur ${availablePages.length}`}</span></div>
   {totalQuestions.length>1&&<div className="h-1.5 w-full overflow-hidden rounded-full bg-[#e3ece1]" role="progressbar" aria-label="Questions complétées" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-[var(--monk-accent)] transition-[width] duration-300" style={{width:`${progress}%`}}/></div>}
   <header className="pb-10 pt-10 sm:pt-12">
    {pageIndex===0&&<><h1 className="font-display text-[clamp(2.2rem,6vw,3.5rem)] font-extrabold leading-tight tracking-[-.055em] " style={{color:'var(--monk-text)'}}>{form.title}</h1>{form.description&&<p className="mt-4 max-w-2xl whitespace-pre-line text-base leading-8 text-[#607265]">{form.description}</p>}</>}
    {(availablePages.length>1||(page?.title&&page.title!=='Nouvelle page'))&&<h2 className={'font-display font-bold text-[#35583f] '+(pageIndex===0?'mt-9 text-2xl':'text-3xl')}>{page?.title||`Page ${pageIndex+1}`}</h2>}
    {page?.description&&<p className="mt-3 whitespace-pre-line text-sm leading-7 text-[#607265]">{page.description}</p>}
   </header>
   <div className="space-y-4">{page?.questions.filter(q=>journey?.visibleIds.has(q.id)).map(q=><QuestionField key={q.id} question={{...q,required:journey?.requiredIds.has(q.id)??q.required}} value={answers[q.id]} onChange={v=>setAnswer(q.id,v)} error={errors[q.id]} audioStatus={uploadStates[q.id]}/>)}</div>
   {error&&<div role="alert" className="mt-6 flex gap-3 rounded-2xl border border-[#f0d4cc] bg-[#fff8f4] p-4 text-sm text-[#aa594d]"><CircleAlert className="shrink-0" size={19}/>{error}</div>}
   <nav aria-label="Navigation dans le formulaire" className="mt-9 flex flex-wrap items-center justify-between gap-4">
    {previousPage!==undefined?<button type="button" className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 font-semibold text-[#42664b] hover:bg-[#edf4eb]" onClick={()=>{setError('');setPageIndex(previousPage!);}}><ArrowLeft size={18}/> Retour</button>:<span/>}
    {nextPage!==undefined?<button type="button" className={solid} onClick={next}>Continuer <ArrowRight size={18}/></button>:<button type="button" disabled={submitting} className={solid} onClick={()=>void send()}>{submitting?<LoaderCircle className="animate-spin" size={18}/>:<Check size={18}/>} {submitting?'Finalisation de l’envoi…':'Envoyer mes réponses'}</button>}
   </nav>
   {visualChoices&&pageIndex===0&&<div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#d9e9dc] bg-white/95 px-3 py-2.5 shadow-[0_-5px_22px_rgba(35,66,47,.1)] backdrop-blur-md">
     <div className="mx-auto flex max-w-[740px] items-center justify-between gap-3">
      <p role="status" className="text-xs font-semibold text-[#38634a] sm:text-sm">{selectedVisual===0?'Aucune sortie sélectionnée':selectedVisual+' sortie'+(selectedVisual>1?'s':'')+' retenue'+(selectedVisual>1?'s':'')}</p>
      <button type="button" disabled={submitting} onClick={()=>{if(nextPage!==undefined)next();else void send();}} className={solid+' !rounded-xl !px-4 !py-2.5 !text-sm'}>{nextPage!==undefined?'Configurer mes sorties':submitting?'Envoi…':selectedVisual>0?'Valider mes choix':'Terminer sans sortie'} {nextPage!==undefined?<ArrowRight size={15}/>:<Check size={15}/>}</button>
     </div>
    </div>}
   
  </div>
 </main>;
}
