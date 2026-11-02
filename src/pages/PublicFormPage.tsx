import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, CircleAlert, FileQuestion, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';
import { AudioRecorder } from '../components/AudioRecorder';
import { audioMode, type UploadedAudio, AUDIO_PART_BYTES } from '../shared/audio';
import { type AnswerValues, type PublicForm, type PublicQuestion, toSubmissionAnswers, validateAnswers } from '../shared/publicForm';

type ApiResult<T>={ok:true;data:T}|{ok:false;error:{code:string;message:string}};
const fieldStyle='w-full rounded-2xl border border-[#dce7dc] bg-white px-4 py-3.5 text-[#294735] outline-none transition focus:border-[#5b986e] focus:ring-4 focus:ring-[#e0eee0]';
const solid='inline-flex items-center justify-center gap-2 rounded-2xl bg-[#286846] px-6 py-3.5 font-semibold text-white shadow-sm transition hover:bg-[#1d5337] disabled:cursor-not-allowed disabled:opacity-60';

async function getPublic(slug:string,signal:AbortSignal):Promise<PublicForm>{
 const response=await fetch(`/api/public/forms/${encodeURIComponent(slug)}`,{signal,headers:{Accept:'application/json'},cache:'no-store'});
 const payload=await response.json() as ApiResult<PublicForm>;
 if(!payload.ok)throw new Error(payload.error.message);
 return payload.data;
}
function QuestionField({question,value,onChange,error}: {question:PublicQuestion;value:AnswerValues[string];onChange:(value:AnswerValues[string])=>void;error?:string}){
 const describedBy=`description-${question.id}`;
 const errorId=`error-${question.id}`;
 const ariaDesc=[question.description?describedBy:null,error?errorId:null].filter(Boolean).join(' ')||undefined;
 const options=question.options;
 const mode=question.mode??audioMode(question.type);
 const [preferAudio,setPreferAudio]=useState(false);
 const vocal=mode==='audio'||(mode==='either'&&preferAudio);
 const draft=value&&typeof value==='object'&&!Array.isArray(value)&&value.kind==='audio-draft'?value:undefined;
 const common={id:question.id,'aria-invalid':!!error,'aria-describedby':ariaDesc,required:question.required} as const;
 return <div className="rounded-[26px] border border-[#e6eee4] bg-white p-5 shadow-[0_9px_35px_-28px_rgba(29,68,44,.3)] sm:p-7">
  {question.type==='statement' ? <>
   <div className="mb-3 h-1 w-9 rounded-full bg-[#82ad8a]"/>
   <h3 className="font-display text-xl font-bold leading-snug text-[#294a34]">{question.label}</h3>
   {question.description&&<p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-[#728678]">{question.description}</p>}
  </> : <>
   <label htmlFor={question.id} className="font-display mb-2 block text-[17px] font-bold leading-snug text-[#294a34]">
    {question.label} {question.required ? <span aria-label="obligatoire" className="text-[#c07962]">*</span> : <span className="ml-1 text-xs font-normal text-[#97a698]">Facultatif</span>}
   </label>
   {question.description&&<p id={describedBy} className="mb-4 whitespace-pre-line text-sm leading-6 text-[#859688]">{question.description}</p>}
   <div className={question.description?'mt-3':'mt-4'}>
    {mode==='either'&&<div className="mb-4 flex gap-2" role="group" aria-label="Type de réponse">
     <button type="button" className="rounded-lg border px-3 py-2 text-sm" aria-pressed={!preferAudio} onClick={()=>{setPreferAudio(false);onChange(undefined);}}>Écrire</button>
     <button type="button" className="rounded-lg border px-3 py-2 text-sm" aria-pressed={preferAudio} onClick={()=>{setPreferAudio(true);onChange(undefined);}}>Parler</button>
    </div>}
    {!vocal&&question.type==='short_text'&&<input {...common} className={fieldStyle} type="text" maxLength={500} placeholder="Votre réponse…" value={typeof value==='string'?value:''} onChange={e=>onChange(e.target.value)}/>}
    {!vocal&&question.type==='long_text'&&<textarea {...common} className={fieldStyle+' min-h-32 resize-y'} rows={4} maxLength={10000} placeholder="Racontez-nous…" value={typeof value==='string'?value:''} onChange={e=>onChange(e.target.value)}/>}
    {question.type==='number'&&<input {...common} className={fieldStyle} type="number" placeholder="0" value={typeof value==='number'&&Number.isFinite(value)?value:''} onChange={e=>onChange(e.target.value===''?undefined:Number(e.target.value))}/>}
    {question.type==='date'&&<input {...common} className={fieldStyle} type="date" value={typeof value==='string'?value:''} onChange={e=>onChange(e.target.value)}/>}
    {question.type==='select'&&<select {...common} className={fieldStyle} value={typeof value==='string'?value:''} onChange={e=>onChange(e.target.value)}>
      <option value="">Choisir une réponse…</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
    </select>}
    {question.type==='single_choice'&&<fieldset aria-describedby={ariaDesc} aria-invalid={!!error} className="space-y-2">
      <legend className="sr-only">{question.label}</legend>
      {options.map(o=><label key={o.value} className={'flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3.5 text-sm transition '+(value===o.value?'border-[#7eab87] bg-[#eff7ed] text-[#2c6041]':'border-[#e0e9de] hover:bg-[#f7faf5]')}>
        <input type="radio" name={question.id} checked={value===o.value} value={o.value} onChange={()=>onChange(o.value)} className="h-4 w-4 accent-[#33764c]"/>{o.label}
      </label>)}
    </fieldset>}
    {question.type==='multiple_choice'&&<fieldset aria-describedby={ariaDesc} aria-invalid={!!error} className="space-y-2">
      <legend className="sr-only">{question.label}</legend>
      {options.map(o=>{const checked=Array.isArray(value)&&value.includes(o.value);return <label key={o.value} className={'flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3.5 text-sm transition '+(checked?'border-[#7eab87] bg-[#eff7ed] text-[#2c6041]':'border-[#e0e9de] hover:bg-[#f7faf5]')}>
        <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked?[...(Array.isArray(value)?value:[]),o.value]:(Array.isArray(value)?value:[]).filter(v=>v!==o.value))} className="h-4 w-4 accent-[#33764c]"/>{o.label}
      </label>})}
    </fieldset>}
    {vocal&&value&&typeof value==='object'&&!Array.isArray(value)&&value.kind==='audio'&&
      <p className="rounded-xl bg-[#eaf4e8] p-3 text-sm">Enregistrement prêt pour l'envoi.</p>}
    {vocal&&<AudioRecorder value={draft} onChange={onChange} maxSeconds={question.maxAudioSeconds??180} maxBytes={question.maxAudioBytes??15*1048576}/>}
   </div>
   {error&&<p id={errorId} role="alert" className="mt-3 flex items-start gap-2 text-sm font-medium text-[#ad5e4e]"><CircleAlert size={16} className="mt-0.5 shrink-0"/>{error}</p>}
  </>}
 </div>;
}

export function PublicFormPage(){
 const {slug=''}=useParams<{slug:string}>();
 const [form,setForm]=useState<PublicForm|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [pageIndex,setPageIndex]=useState(0);
 const [answers,setAnswers]=useState<AnswerValues>({});
 const [errors,setErrors]=useState<Record<string,string>>({});
 const [consent,setConsent]=useState(false);
 const [consentError,setConsentError]=useState(false);
 const [submitting,setSubmitting]=useState(false);
 const [submitted,setSubmitted]=useState(false);
 const [declined,setDeclined]=useState(false);
 const nonceRef=useRef(crypto.randomUUID());
 const inFlightRef=useRef(false);
 useEffect(()=>{
  const controller=new AbortController();
  setForm(null);setLoading(true);setError('');setPageIndex(0);setAnswers({});setConsent(false);setSubmitted(false);setDeclined(false);setErrors({});nonceRef.current=crypto.randomUUID();
  getPublic(slug,controller.signal).then(data=>{if(!controller.signal.aborted)setForm(data);}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Formulaire indisponible.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[slug]);
 const page=form?.pages[pageIndex];
 const progress=form?Math.round((pageIndex+1)/Math.max(1,form.pages.length)*100):0;
 function setAnswer(id:string,value:AnswerValues[string]){setAnswers(prev=>({...prev,[id]:value}));setErrors(prev=>{const n={...prev};delete n[id];return n;});}
 function validatePage(){if(!form||!page)return false;
  const issue=validateAnswers({...form,pages:[page]},answers);
  setErrors(issue);
  if(Object.keys(issue).length){document.getElementById(Object.keys(issue)[0])?.focus();return false;}
  return true;
 }
 function next(){if(!validatePage())return;setPageIndex(index=>Math.min(index+1,(form?.pages.length??1)-1));window.scrollTo?.({top:0,behavior:'smooth'});}
 async function send(){
  if(!form||inFlightRef.current)return;
  const issue=validateAnswers(form,answers);setErrors(issue);
  if(Object.keys(issue).length){const first=form.pages.findIndex(p=>p.questions.some(q=>issue[q.id]));if(first>=0)setPageIndex(first);setError('Certaines questions demandent une réponse.');return;}
  if(form.requireConsent&&!consent){setConsentError(true);setError('Le consentement est nécessaire avant l’envoi.');return;}
  inFlightRef.current=true;setSubmitting(true);setError('');
  try{
   const readyValues:AnswerValues={...answers};
   for(const [questionId,value] of Object.entries(readyValues)){
    if(!value||typeof value!=='object'||Array.isArray(value)||value.kind!=='audio-draft')continue;
    const draft=value;
    const api=`/api/public/forms/${encodeURIComponent(form.slug)}/audio`;
    const prepare=await fetch(`${api}/prepare`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({versionId:form.versionId,questionId,clientNonce:nonceRef.current,
        consent:true,mimeType:draft.file.type,byteSize:draft.file.size,durationMs:draft.durationMs})});
    const prep=await prepare.json() as ApiResult<{uploadId:string;claimToken:string;partBytes:number;partCount:number}>;
    if(!prep.ok)throw new Error(prep.error.message);
    const {uploadId,claimToken,partCount}=prep.data;
    for(let i=0;i<partCount;i++){
      const chunk=draft.file.slice(i*AUDIO_PART_BYTES,Math.min((i+1)*AUDIO_PART_BYTES,draft.file.size));
      const result=await fetch(`${api}/${uploadId}/parts/${i}`,{
        method:'POST',headers:{'Content-Type':'application/octet-stream',
         'x-audio-nonce':nonceRef.current,'x-audio-claim':claimToken},body:chunk});
      if(!result.ok)throw new Error(`Envoi audio interrompu à la partie ${i+1}/${partCount}. Réessayez.`);
    }
    const finish=await fetch(`${api}/complete`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({uploadId,claimToken,clientNonce:nonceRef.current})});
    const confirmed=await finish.json() as ApiResult<{verified:boolean}>;
    if(!confirmed.ok||!confirmed.data.verified)
      throw new Error(confirmed.ok?'Le fichier audio est incomplet.':confirmed.error.message);
    readyValues[questionId]={kind:'audio',uploadId,claimToken} satisfies UploadedAudio;
   }
   setAnswers(readyValues);
   const response=await fetch(`/api/public/forms/${encodeURIComponent(form.slug)}/submissions`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({versionId:form.versionId,clientNonce:nonceRef.current,consent,website:'',answers:toSubmissionAnswers(form,readyValues)}),
   });
   const json=await response.json() as ApiResult<{id:string}>;
   if(!json.ok)throw new Error(json.error.message);
   setSubmitted(true);
  }catch(e){setError(e instanceof Error?e.message:'Envoi impossible. Veuillez réessayer.');}
  finally{inFlightRef.current=false;setSubmitting(false);}
 }
 if(loading)return <main className="mx-auto flex min-h-[65vh] max-w-2xl items-center justify-center px-5" role="status"><LoaderCircle className="animate-spin text-[#4d865e]" size={30}/><span className="ml-3 text-[#64806c]">Chargement du questionnaire…</span></main>;
 if(!form)return <main className="mx-auto max-w-xl px-6 py-28 text-center"><FileQuestion className="mx-auto text-[#88a68a]" size={42}/><h1 className="mt-6 font-display text-3xl font-bold">Formulaire indisponible</h1><p className="mt-4 text-[#839487]">{error||'Ce questionnaire est introuvable ou n’a pas été publié.'}</p><Link to="/" className="mt-8 inline-block text-[#327d4c] underline">Retour à l’accueil</Link></main>;
 if(declined)return <main className="mx-auto max-w-xl px-6 py-28 text-center"><ShieldCheck size={48} className="mx-auto text-[#5c946c]"/><h1 className="mt-6 font-display text-3xl font-bold">Choix respecté</h1><p className="mt-4 text-[#6d8271]">Aucune réponse n’a été envoyée. Merci d’avoir pris le temps de consulter ce questionnaire.</p><Link to="/" className="mt-8 inline-block text-[#327d4c] underline">Retour à l’accueil</Link></main>;
 if(submitted)return <main className="mx-auto max-w-xl px-6 py-28 text-center" role="status"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#e4f4e4]"><CheckCircle2 size={44} className="text-[#397b51]"/></div><h1 className="mt-7 font-display text-4xl font-bold">Merci pour votre participation !</h1><p className="mt-4 text-[#718374]">Vos réponses ont bien été enregistrées. Vous pouvez fermer cette page.</p><Link to="/" className="mt-8 inline-block text-[#327d4c] underline">Retour à l’accueil</Link></main>;
 return <main className="min-h-[75vh] bg-[#fafcf8] px-4 pb-24 pt-8 sm:px-7 sm:pt-14">
  <div className="mx-auto max-w-[740px]">
   <div className="mb-8 flex items-center justify-between text-xs font-semibold uppercase tracking-[.12em] text-[#8da18f]"><span>Questionnaire</span><span>Page {pageIndex+1} sur {form.pages.length}</span></div>
   <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#e3ece1]" role="progressbar" aria-label="Progression du formulaire" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-[#5d9b6c] transition-[width] duration-300" style={{width:`${progress}%`}}/></div>
   <header className="pb-10 pt-10 sm:pt-12">
    {pageIndex===0&&<><div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#edf5ea] px-3 py-1.5 text-xs font-bold text-[#648a6b]"><Check size={13}/> Participation libre</div><h1 className="font-display text-[clamp(2.2rem,6vw,3.5rem)] font-extrabold leading-tight tracking-[-.055em] text-[#254632]">{form.title}</h1>{form.description&&<p className="mt-4 max-w-2xl whitespace-pre-line text-base leading-8 text-[#748776]">{form.description}</p>}</>}
    <h2 className={'font-display font-bold text-[#35583f] '+(pageIndex===0?'mt-9 text-2xl':'text-3xl')}>{page?.title||`Page ${pageIndex+1}`}</h2>
    {page?.description&&<p className="mt-3 whitespace-pre-line text-sm leading-7 text-[#819385]">{page.description}</p>}
   </header>
   <div className="space-y-4">{page?.questions.map(q=><QuestionField key={q.id} question={q} value={answers[q.id]} onChange={v=>setAnswer(q.id,v)} error={errors[q.id]}/>)}</div>
   {pageIndex===form.pages.length-1&&form.requireConsent&&<section className="mt-7 rounded-[24px] border border-[#dfebdc] bg-[#f0f7ed] p-5 sm:p-6">
    <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-[#588265]" size={21}/><div><h3 className="font-bold text-[#315c3e]">Consentement à la participation</h3><p className="mt-2 text-sm leading-6 text-[#68816f]">Je comprends que mes réponses seront enregistrées et consultées par les responsables de ce questionnaire. Ma participation est volontaire. Je peux refuser sans envoyer de données.</p></div></div>
    <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm font-semibold text-[#356045]"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#347b4e]" checked={consent} onChange={e=>{setConsent(e.target.checked);setConsentError(false);}}/>J’accepte de participer.</label>
    {consentError&&<p role="alert" className="mt-3 text-sm font-semibold text-[#a9584f]">Pour continuer, confirmez votre accord ou refusez la participation.</p>}
    <button type="button" className="mt-4 text-sm font-medium text-[#9f665b] underline underline-offset-4" onClick={()=>{setAnswers({});setDeclined(true);}}>Je ne souhaite pas participer</button>
   </section>}
   {error&&<div role="alert" className="mt-6 flex gap-3 rounded-2xl border border-[#f0d4cc] bg-[#fff8f4] p-4 text-sm text-[#aa594d]"><CircleAlert className="shrink-0" size={19}/>{error}</div>}
   <nav aria-label="Navigation dans le formulaire" className="mt-9 flex flex-wrap items-center justify-between gap-4">
    {pageIndex>0?<button type="button" className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 font-semibold text-[#588061] hover:bg-[#edf4eb]" onClick={()=>{setError('');setPageIndex(i=>i-1);}}><ArrowLeft size={18}/> Retour</button>:<span className="flex items-center gap-2 text-xs text-[#9ba99b]"><LockKeyhole size={13}/> Envoi sécurisé</span>}
    {pageIndex<form.pages.length-1?<button type="button" className={solid} onClick={next}>Continuer <ArrowRight size={18}/></button>:<button type="button" disabled={submitting} className={solid} onClick={()=>void send()}>{submitting?<LoaderCircle className="animate-spin" size={18}/>:<Check size={18}/>} {submitting?'Envoi en cours…':'Envoyer mes réponses'}</button>}
   </nav>
   <p className="mt-10 text-center text-xs leading-5 text-[#a0aea0]">Créé avec Formulaire de Singe. Aucun compte n’est nécessaire pour répondre.</p>
  </div>
 </main>;
}
