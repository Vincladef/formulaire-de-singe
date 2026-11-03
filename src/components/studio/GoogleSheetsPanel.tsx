import { useCallback,useEffect,useState } from 'react';
import { CheckCircle2,ExternalLink,FileSpreadsheet,Link2,LoaderCircle,RefreshCw,Unplug } from 'lucide-react';
import { getAccessToken } from '../../authClient';
type Status={configured:boolean;connected:boolean;spreadsheetUrl:string|null;lastSyncedAt:string|null;lastError:string|null;pending:number};
type Api<T>={ok:true;data:T}|{ok:false;error:{message:string}};
async function api<T>(formId:string,method='GET',suffix=''):Promise<T>{
 const token=await getAccessToken();
 if(!token)throw new Error('Reconnectez-vous au Studio.');
 const res=await fetch('/api/integrations/google/'+encodeURIComponent(formId)+suffix,{
  method,headers:{Authorization:'Bearer '+token},cache:'no-store'
 });
 const body=await res.json() as Api<T>;
 if(!body.ok)throw new Error(body.error.message);
 return body.data;
}
export function GoogleSheetsPanel({formId,owner=true}:{formId:string;owner?:boolean}){
 const [status,setStatus]=useState<Status|null>(null);
 const [busy,setBusy]=useState(''),[error,setError]=useState('');
 const load=useCallback(async()=>{
  if(!owner)return;
  try{const s=await api<Status>(formId);setStatus(s);}
  catch(e){setError(e instanceof Error?e.message:'Impossible de consulter Google Sheets.');}
 },[formId,owner]);
 useEffect(()=>{void load();},[load]);
 async function connect(){
  setBusy('connect');setError('');
  try{
   const data=await api<{authorizationUrl?:string;connected?:boolean}>(formId,'POST','/start');
   if(data.connected){await load();setBusy('');return;}
   if(!data.authorizationUrl)throw new Error('Le lien Google Sheets n’a pas été créé.');
   // The signed-in owner returns here after a provider-managed OAuth consent.
   window.sessionStorage.setItem('monk-google-pending-form',formId);
   window.location.assign(data.authorizationUrl);
  }catch(e){setError(e instanceof Error?e.message:'Connexion indisponible.');setBusy('');}
 }
 async function disconnect(){
  if(!window.confirm('Arrêter la synchronisation ? Le fichier Google Sheets restera dans votre Drive.'))return;
  setBusy('disconnect');setError('');
  try{await api(formId,'DELETE');await load();}
  catch(e){setError(e instanceof Error?e.message:'Déconnexion impossible.');}
  finally{setBusy('');}
 }
 async function syncNow(){
  setBusy('sync');setError('');
  try{await api(formId,'POST','/sync');await load();}
  catch(e){setError(e instanceof Error?e.message:'Synchronisation impossible.');}
  finally{setBusy('');}
 }
 async function retry(){
  setBusy('retry');setError('');
  try{await api(formId,'POST','/retry');await api(formId,'POST','/sync');await load();}
  catch(e){setError(e instanceof Error?e.message:'Relance impossible.');}
  finally{setBusy('');}
 }
 if(!owner)return null;
 return <section className="rounded-2xl border border-[#e1e9de] bg-white p-5 sm:p-6" aria-label="Synchronisation Google Sheets">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div className="flex items-start gap-3">
    <div className="rounded-xl bg-[#e8f2e7] p-2.5 text-[#377950]"><FileSpreadsheet size={22}/></div>
    <div><h3 className="text-lg font-bold text-[#2a5038]">Google Sheets</h3><p className="mt-1 max-w-md text-sm leading-6 text-[#788b7b]">Chaque participation crée automatiquement une ligne dans votre feuille, y compris pour les réponses reçues avant la connexion.</p></div>
   </div>
   {status?.connected&&<span className="inline-flex items-center gap-1 rounded-full bg-[#e8f4e9] px-3 py-1 text-xs font-semibold text-[#3a7550]"><CheckCircle2 size={14}/> Connecté</span>}
  </div>
  {error&&<p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
  {!status&&!error&&<p className="mt-4 text-sm text-[#7b9281]"><LoaderCircle size={16} className="mr-2 inline animate-spin"/> Vérification de la connexion…</p>}
  {status&&!status.configured&&<p className="mt-4 rounded-lg bg-[#fff7e7] p-3 text-sm leading-6 text-[#8e723a]" role="status"><strong>Connexion Google à activer.</strong> La connexion simplifiée est en cours d’activation pour ce site. Vous n’avez aucune configuration Google Cloud à effectuer ; vous pourrez sélectionner votre compte Google ici dès que le service sera prêt.</p>}
  {status&&!status.connected&&<button type="button" disabled={!!busy||!status.configured} onClick={()=>void connect()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#337450] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
   {busy==='connect'?<LoaderCircle size={16} className="animate-spin"/>:<Link2 size={16}/>} Connecter Google Sheets
  </button>}
  {status?.connected&&<div className="mt-5 space-y-3 border-t border-[#edf2eb] pt-4">
   {status.spreadsheetUrl&&<a className="inline-flex items-center gap-1.5 font-semibold text-[#387951] underline underline-offset-4" target="_blank" rel="noopener noreferrer" href={status.spreadsheetUrl}>Ouvrir mon Google Sheet <ExternalLink size={15}/></a>}
   <div className="grid gap-2 text-xs text-[#778b7c] sm:grid-cols-2"><p>Dernier envoi : {status.lastSyncedAt?new Date(status.lastSyncedAt).toLocaleString('fr-FR'):'En attente'}</p><p>Réponses en attente : {status.pending}</p></div>
   {status.lastError&&<p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Dernière erreur : {status.lastError}</p>}
   <div className="flex flex-wrap items-center gap-3 pt-1">
    <button type="button" disabled={!!busy||!status.configured} onClick={()=>void syncNow()} className="inline-flex items-center gap-1.5 rounded-lg border border-[#bcd9bd] bg-[#eaf5e9] px-3 py-2 text-xs font-semibold text-[#2e6541] hover:bg-[#dcf0dc] disabled:opacity-50">{busy==='sync'?<LoaderCircle size={14} className="animate-spin"/>:<RefreshCw size={14}/>} Synchroniser maintenant</button>
    {status.lastError&&<button type="button" disabled={!!busy} onClick={()=>void retry()} className="inline-flex items-center gap-1.5 rounded-lg border border-[#d9e5da] px-3 py-2 text-xs font-semibold text-[#4b7156] hover:bg-[#f2f7f1]"><RefreshCw size={14}/> Réessayer les échecs</button>}
    <button type="button" disabled={!!busy} onClick={()=>void disconnect()} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-[#a56f69] hover:bg-red-50"><Unplug size={14}/> Déconnecter</button>
   </div>
  </div>}
  <p className="mt-4 text-xs leading-5 text-[#98a79b]">L’application crée un Google Sheet dans votre compte après autorisation ; vos réponses précédentes y sont ajoutées. Les fichiers audio restent privés ; seule leur présence apparaît dans la feuille.</p>
 </section>;
}
