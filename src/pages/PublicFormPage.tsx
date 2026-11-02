import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, CircleAlert, FileQuestion, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';
import { type AudioDraft, type UploadedAudio } from '../shared/audio';
import { AudioRecorder } from '../components/AudioRecorder';
import { audioMode } from '../shared/audio';
import { FormAppearance } from '../components/FormAppearance';
import { type AnswerValues, type PublicForm, type PublicQuestion, toSubmissionAnswers, validateAnswers } from '../shared/publicForm';

type ApiResult<T>={ok:true;data:T}|{ok:false;error:{code:string;message:string}};
const fieldStyle='form-field w-full rounded-2xl border border-[#dce7dc] bg-white px-4 py-3.5 text-[#294735] outline-none transition focus:border-[#5b986e] focus:ring-4 focus:ring-[#e0eee0]';
const solid='form-primary inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#286846] px-6 py-3.5 font-semibold text-white shadow-sm transition hover:bg-[#1d5337] disabled:cursor-not-allowed disabled:opacity-60';

async function getPublic(slug:string,signal:AbortSignal):Promise<PublicForm>{
 const response=await fetch(`/api/public/forms/${encodeURIComponent(slug)}`,{signal,headers:{Accept:'application/json'},cache:'no-store'});
 const payload=await response.json() as ApiResult<PublicForm>;
 if(!payload.ok)throw new Error(payload.error.message);
 return payload.data;
}
function QuestionField({question,value,onChange,error,disabled=false}: {question:PublicQuestion;value:AnswerValues[string];onChange:(value:AnswerValues[string])=>void;error?:string;disabled?:boolean}){
 const describedBy=`description-${question.id}`;
 const errorId=`error-${question.id}`;
 const ariaDesc=[question.description?describedBy:null,error?errorId:null].filter(Boolean).join(' ')||undefined;
 const options=question.options;
 const mode=question.mode??audioMode(question.type);
 const [preferAudio,setPreferAudio]=useState(()=>Boolean(value&&typeof value==='object'&&!Array.isArray(value))); 
 const vocal=mode==='audio'||(mode==='either'&&preferAudio);
 const draft=(value&&typeof value==='object'&&!Array.isArray(value)&&value.kind==='audio-draft')?value as AudioDraft:undefined;
 const common={id:question.id,'aria-invalid':!!error,'aria-describedby':ariaDesc,required:question.required} as const;
 return <div className="form-question-card p-5 sm:p-7">
  {question.type==='statement' ? <>
   <div className="mb-3 h-1 w-9 rounded-full bg-[#82ad8a]"/>
   <h3 className="font-display text-xl font-bold leading-snug text-[#294a34]">{question.label}</h3>
   {question.description&&<p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-[#5f6f64]">{question.description}</p>}
  </> : <>
   <label htmlFor={question.id} className="form-title mb-2 block text-[17px] font-bold leading-snug">
    {question.label} {question.required ? <span aria-label="obligatoire" className="text-[#945e4c]">*</span> : <span className="ml-1 text-xs font-normal text-[#656e65]">Facultatif</span>}
   </label>
   {question.description&&<p id={describedBy} className="mb-4 whitespace-pre-line text-sm leading-6 text-[#626e64]">{question.description}</p>}
   <div className={question.description?'mt-3':'mt-4'}>
    {mode==='either'&&<div className="mb-4 flex gap-2" role="group" aria-label="Choisir le mode de réponse"><button type="button" className={!vocal?'form-primary min-h-10 px-4 py-2':'min-h-10 rounded-xl border px-4 py-2'} onClick={()=>{setPreferAudio(false);onChange(undefined);}}>Écrire</button><button type="button" className={vocal?'form-primary min-h-10 px-4 py-2':'min-h-10 rounded-xl border px-4 py-2'} onClick={()=>{setPreferAudio(true);onChange(undefined);}}>Parler</button></div>}
    {!vocal&&question.type==='short_text'&&<input {...common} className={fieldStyle} type="text" maxLength={500} placeholder="Votre réponse…" value={typeof value==='string'?value:''} onChange={e=>onChange(e.target.value)}/>}
    {!vocal&&question.type==='long_text'&&<textarea {...common} className={fieldStyle+' min-h-32 resize-y'} rows={4} maxLength={10000} placeholder="Racontez-nous…" value={typeof value==='string'?value:''} onChange={e=>onChange(e.target.value)}/>}
    {question.type==='number'&&<input {...common} className={fieldStyle} type="number" placeholder="0" value={typeof value==='number'&&Number.isFinite(value)?value:''} onChange={e=>onChange(e.target.value===''?undefined:Number(e.target.value))}/>}
    {question.type==='date'&&<input {...common} className={fieldStyle} type="date" value={typeof value==='string'?value:''} onChange={e=>onChange(e.target.value)}/>}
    {question.type==='select'&&<select {...common} className={fieldStyle} value={typeof value==='string'?value:''} onChange={e=>onChange(e.target.value)}>
      <option value="">Choisir une réponse…</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
    </select>}
    {question.type==='single_choice'&&<fieldset aria-describedby={ariaDesc} aria-invalid={!!error} className="space-y-2">
      <legend className="sr-only">{question.label}</legend>
      {options.map(o=><label key={o.value} data-selected={value===o.value} className="form-choice flex cursor-pointer items-center gap-3 px-4 py-3.5 text-sm transition">
        <input type="radio" name={question.id} checked={value===o.value} value={o.value} onChange={()=>onChange(o.value)} className="h-4 w-4"/>{o.label}
      </label>)}
    </fieldset>}
    {question.type==='multiple_choice'&&<fieldset aria-describedby={ariaDesc} aria-invalid={!!error} className="space-y-2">
      <legend className="sr-only">{question.label}</legend>
      {options.map(o=>{const checked=Array.isArray(value)&&value.includes(o.value);return <label key={o.value} data-selected={checked} className="form-choice flex cursor-pointer items-center gap-3 px-4 py-3.5 text-sm transition">
        <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked?[...(Array.isArray(value)?value:[]),o.value]:(Array.isArray(value)?value:[]).filter(v=>v!==o.value))} className="h-4 w-4"/>{o.label}
      </label>})}
    </fieldset>}
    {vocal&&value&&typeof value==='object'&&!Array.isArray(value)&&value.kind==='audio'&&<div className="mb-3 rounded-xl bg-[#e8f3ea] p-3 text-sm text-[#416b4d]">Enregistrement transféré. Il sera enregistré avec votre participation.</div>}
    {vocal&&<AudioRecorder value={draft} disabled={disabled} maxSeconds={question.maxAudioSeconds??180} maxBytes={question.maxAudioBytes??15*1048576} onChange={onChange}/>}
   </div>
   {error&&<p id={errorId} role="alert" className="mt-3 flex items-start gap-2 text-sm font-medium text-[#a15749]"><CircleAlert size={16} className="mt-0.5 shrink-0"/>{error}</p>}
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
 const steps=form?(form.theme?.layout==='questions'
  ? form.pages.flatMap((p,pIndex)=>p.questions.length?p.questions.map(q=>({page:p,pageNumber:pIndex,questions:[q]})):[{page:p,pageNumber:pIndex,questions:[] as PublicQuestion[]}])
  : form.pages.map((p,pIndex)=>({page:p,pageNumber:pIndex,questions:p.questions}))):[];
 const current=steps[pageIndex];
 const page=current?.page;
 const visibleQuestions=current?.questions??[];
 const progress=steps.length?Math.round((pageIndex+1)/steps.length*100):0;
 function setAnswer(id:string,value:AnswerValues[string]){setAnswers(prev=>({...prev,[id]:value}));setErrors(prev=>{const n={...prev};delete n[id];return n;});}
 function validatePage(){if(!form||!page)return false;
  const issue=validateAnswers({...form,pages:[{...page,questions:visibleQuestions}]},answers);
  setErrors(issue);
  if(Object.keys(issue).length){document.getElementById(Object.keys(issue)[0])?.focus();return false;}
  return true;
 }
 function next(){if(!validatePage())return;setPageIndex(index=>Math.min(index+1,steps.length-1));window.scrollTo?.({top:0,behavior:'smooth'});}
 async function send(){
  if(!form||inFlightRef.current)return;
  const issue=validateAnswers(form,answers);setErrors(issue);
  if(Object.keys(issue).length){const first=steps.findIndex(p=>p.questions.some(q=>issue[q.id]));if(first>=0)setPageIndex(first);setError('Certaines questions demandent une réponse.');return;}
  if(form.requireConsent&&!consent){setConsentError(true);setError('Le consentement est nécessaire avant l’envoi.');return;}
  inFlightRef.current=true;setSubmitting(true);setError('');
  try{
   // Upload only after consent; do not send raw bytes through Netlify Functions.
   const readyValues:AnswerValues={...answers};
   for(const [questionId,value] of Object.entries(readyValues)){
    if(!value||typeof value!=='object'||Array.isArray(value)||value.kind!=='audio-draft')continue;
    const draft=value as AudioDraft;
    const prep=await fetch(`/api/public/forms/${encodeURIComponent(form.slug)}/audio/prepare`,{
     method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({versionId:form.versionId,questionId,clientNonce:nonceRef.current,
      consent:true,mimeType:draft.file.type,byteSize:draft.file.size,durationMs:draft.durationMs}),
    });
    const body=await prep.json() as ApiResult<{uploadId:string;claimToken:string;uploadUrl:string;contentType:string}>;
    if(!body.ok)throw new Error(body.error.message);
    const upload=await fetch(body.data.uploadUrl,{method:'PUT',headers:{'Content-Type':body.data.contentType},body:draft.file});
    if(!upload.ok)throw new Error('Le transfert audio a échoué. Réessayez.');
    const verify=await fetch(`/api/public/forms/${encodeURIComponent(form.slug)}/audio/complete`,{
     method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uploadId:body.data.uploadId,claimToken:body.data.claimToken,clientNonce:nonceRef.current}),
    });
    const verified=await verify.json() as ApiResult<{verified:boolean}>;
    if(!verified.ok||!verified.data.verified)throw new Error(verified.ok?'Le fichier audio n’a pas été validé.':verified.error.message);
    readyValues[questionId]={kind:'audio',uploadId:body.data.uploadId,claimToken:body.data.claimToken} satisfies UploadedAudio;
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
 if(loading)return <main className="mx-auto flex min-h-[65vh] max-w-2xl items-center justify-center px-5" role="status"><LoaderCircle className="animate-spin text-[#447653]" size={30}/><span className="ml-3 text-[#597160]">Chargement du questionnaire…</span></main>;
 if(!form)return <main className="mx-auto max-w-xl px-6 py-28 text-center"><FileQuestion className="mx-auto text-[#5c705e]" size={42}/><h1 className="mt-6 font-display text-3xl font-bold">Formulaire indisponible</h1><p className="mt-4 text-[#626e65]">{error||'Ce questionnaire est introuvable ou n’a pas été publié.'}</p><Link to="/" className="mt-8 inline-block text-[#31794a] underline">Retour à l’accueil</Link></main>;
 if(declined)return <main className="mx-auto max-w-xl px-6 py-28 text-center"><ShieldCheck size={48} className="mx-auto text-[#497556]"/><h1 className="mt-6 font-display text-3xl font-bold">Choix respecté</h1><p className="mt-4 text-[#5e7062]">Aucune réponse n’a été envoyée. Merci d’avoir pris le temps de consulter ce questionnaire.</p><Link to="/" className="mt-8 inline-block text-[#31794a] underline">Retour à l’accueil</Link></main>;
 if(submitted)return <main className="mx-auto max-w-xl px-6 py-28 text-center" role="status"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#e4f4e4]"><CheckCircle2 size={44} className="text-[#38784f]"/></div><h1 className="mt-7 font-display text-4xl font-bold">Merci pour votre participation !</h1><p className="mt-4 text-[#606f63]">Vos réponses ont bien été enregistrées. Vous pouvez fermer cette page.</p><Link to="/" className="mt-8 inline-block text-[#31794a] underline">Retour à l’accueil</Link></main>;
 return <FormAppearance theme={form.theme}><main className="min-h-[75vh] px-4 pb-24 pt-8 sm:px-7 sm:pt-14">
  <div className="mx-auto max-w-[740px]">
   <div className="mb-8 flex items-center justify-between text-xs font-semibold uppercase tracking-[.12em] text-[#626f63]"><span>Questionnaire</span><span>{form.theme?.layout==='questions'?'Question':'Étape'} {pageIndex+1} sur {steps.length}</span></div>
   <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#e3ece1]" role="progressbar" aria-label="Progression du formulaire" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><div className="form-progress-bar h-full rounded-full transition-[width] duration-300" style={{width:`${progress}%`}}/></div>
   <header className="pb-10 pt-10 sm:pt-12">
    {pageIndex===0&&<><div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#edf5ea] px-3 py-1.5 text-xs font-bold text-[#547359]"><Check size={13}/> Participation libre</div><h1 className="form-title text-[clamp(2.2rem,6vw,3.5rem)] font-extrabold leading-tight tracking-[-.055em]">{form.title}</h1>{form.description&&<p className="mt-4 max-w-2xl whitespace-pre-line text-base leading-8 text-[#606f61]">{form.description}</p>}</>}
    <h2 className={'form-title font-bold '+(pageIndex===0?'mt-9 text-2xl':'text-3xl')}>{page?.title||`Page ${pageIndex+1}`}</h2>
    {page?.description&&<p className="mt-3 whitespace-pre-line text-sm leading-7 text-[#616f65]">{page.description}</p>}
   </header>
   <div className="space-y-4">{visibleQuestions.map(q=><QuestionField key={q.id} question={q} value={answers[q.id]} onChange={v=>setAnswer(q.id,v)} error={errors[q.id]} disabled={submitting}/>)}</div>
   {pageIndex===steps.length-1&&form.requireConsent&&<section className="mt-7 rounded-[24px] border border-[#dfebdc] bg-[#f0f7ed] p-5 sm:p-6">
    <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-[#4e745a]" size={21}/><div><h3 className="font-bold text-[#315c3e]">Consentement à la participation</h3><p className="mt-2 text-sm leading-6 text-[#5b7061]">Je comprends que mes réponses seront enregistrées et consultées par les responsables de ce questionnaire. Ma participation est volontaire. Je peux refuser sans envoyer de données.</p></div></div>
    <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm font-semibold text-[#356045]"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#347b4e]" checked={consent} onChange={e=>{setConsent(e.target.checked);setConsentError(false);}}/>J’accepte de participer.</label>
    {consentError&&<p role="alert" className="mt-3 text-sm font-semibold text-[#a3554c]">Pour continuer, confirmez votre accord ou refusez la participation.</p>}
    <button type="button" className="mt-4 text-sm font-medium text-[#935e54] underline underline-offset-4" onClick={()=>{setAnswers({});setDeclined(true);}}>Je ne souhaite pas participer</button>
   </section>}
   {error&&<div role="alert" className="mt-6 flex gap-3 rounded-2xl border border-[#f0d4cc] bg-[#fff8f4] p-4 text-sm text-[#a3554a]"><CircleAlert className="shrink-0" size={19}/>{error}</div>}
   <nav aria-label="Navigation dans le formulaire" className="mt-9 flex flex-wrap items-center justify-between gap-4">
    {pageIndex>0?<button type="button" className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 font-semibold text-[#4f7458] hover:bg-[#edf4eb]" onClick={()=>{setError('');setPageIndex(i=>i-1);}}><ArrowLeft size={18}/> Retour</button>:<span className="flex items-center gap-2 text-xs text-[#656e65]"><LockKeyhole size={13}/> Envoi sécurisé</span>}
    {pageIndex<steps.length-1?<button type="button" className={solid} onClick={next}>Continuer <ArrowRight size={18}/></button>:<button type="button" disabled={submitting} className={solid} onClick={()=>void send()}>{submitting?<LoaderCircle className="animate-spin" size={18}/>:<Check size={18}/>} {submitting?'Envoi en cours…':'Envoyer mes réponses'}</button>}
   </nav>
   <p className="mt-10 text-center text-xs leading-5 text-[#656e65]">Créé avec Formulaire de Singe. Aucun compte n’est nécessaire pour répondre.</p>
  </div>
 </main></FormAppearance>;
}
