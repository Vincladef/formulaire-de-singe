import { useLocation, Link } from 'react-router-dom';
import { useState } from 'react';
import { ShieldCheck, ShieldAlert, LockKeyhole, LoaderCircle } from 'lucide-react';
import { authClient, getAccessToken } from '../authClient';

const descriptions:Record<string,string>={
 'forms:read':'Consulter les formulaires et leurs questions',
 'forms:write':'Créer, modifier et classer les formulaires',
 'forms:publish':'Publier un formulaire avec confirmation',
 'offline_access':'Conserver la connexion entre les conversations',
};
function SignedInConsent(){
 const session=authClient!.useSession();
 const location=useLocation();
 const [working,setWorking]=useState(false);
 const [error,setError]=useState('');
 const params=new URLSearchParams(location.search);
 const requested=(params.get('scope')??'').split(' ').filter(Boolean);
 const returnTo=location.pathname+location.search;
 async function approve(){
  if(working)return;setWorking(true);setError('');
  try{
   const token=await getAccessToken();
   if(!token)throw Error('Connexion expirée. Reconnecte-toi.');
   const res=await fetch('/api/mcp/consent',{
    method:'POST',cache:'no-store',
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({params:Object.fromEntries(params.entries())}),
   });
   const data:unknown=await res.json();
   if(!res.ok||!data||typeof data!=='object'||!('redirectUrl' in data)||typeof data.redirectUrl!=='string')
    throw Error(data&&typeof data==='object'&&'error_description' in data&&typeof data.error_description==='string'
      ?data.error_description:'Autorisation indisponible.');
   // Server validates redirect URI against verified ChatGPT CIMD metadata.
   window.location.assign(data.redirectUrl);
  }catch(e){setError(e instanceof Error?e.message:'Autorisation impossible.');setWorking(false);}
 }
 if(session.isPending)return <main role="status" className="mx-auto max-w-xl p-12 text-center">Vérification du compte…</main>;
 if(!session.data?.user)return <main className="mx-auto max-w-lg px-5 py-16">
   <LockKeyhole className="mb-5 text-[#39714d]" size={32}/>
   <h1 className="font-display text-3xl font-bold text-[#294836]">Connecter Monk Form à ChatGPT</h1>
   <p className="mt-4 leading-7 text-[#647b69]">Identifie-toi d’abord à Monk Form pour choisir le compte à connecter. Aucun mot de passe n’est communiqué à ChatGPT.</p>
   <Link className="mt-7 inline-flex min-h-12 items-center rounded-xl bg-[#2b6946] px-5 font-semibold text-white" to={'/connexion?returnTo='+encodeURIComponent(returnTo)}>Se connecter pour continuer</Link>
  </main>;
 return <main className="mx-auto max-w-xl px-5 py-16">
  <div className="rounded-2xl border border-[#dae6d8] bg-white p-7 shadow-sm sm:p-9">
   <ShieldCheck className="mb-5 text-[#377c4b]" size={36}/>
   <p className="text-xs font-semibold uppercase tracking-wider text-[#65846d]">Connexion sécurisée</p>
   <h1 className="font-display mt-2 text-3xl font-bold text-[#284b36]">Autoriser ChatGPT ?</h1>
   <p className="mt-4 text-sm leading-7 text-[#536d59]">
    ChatGPT souhaite accéder aux fonctions de Monk Form avec le compte actuellement connecté.
    Tu pourras retirer cette autorisation à tout moment dans « Mes connexions ».
   </p>
   <div className="mt-5 rounded-xl bg-[#f2f7f1] p-4">
    <p className="text-xs font-semibold text-[#385d43]">Autorisations demandées</p>
    <ul className="mt-2 space-y-2 text-sm text-[#435e4b]">
     {requested.map(scope=><li key={scope} className="flex items-start gap-2"><ShieldCheck size={15} className="mt-1 shrink-0 text-[#4e855c]"/>{descriptions[scope]??'Autorisation : '+scope}</li>)}
    </ul>
   </div>
   <p className="mt-4 text-xs leading-6 text-[#677c6a]">Les formulaires créés par ChatGPT restent privés jusqu’à une publication autorisée. Monk Form ne transmet ni ton mot de passe ni tes réponses privées en dehors des demandes que tu autorises.</p>
   {error&&<p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700"><ShieldAlert size={17}/>{error}</p>}
   <div className="mt-7 flex flex-wrap items-center justify-end gap-3">
    <Link to="/studio" className="flex min-h-11 items-center rounded-xl border border-[#dce6dc] px-4 text-sm font-semibold text-[#415c48] hover:bg-[#f1f5ef]">Refuser</Link>
    <button type="button" onClick={()=>void approve()} disabled={working}
     className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#2b6946] px-5 text-sm font-semibold text-white hover:bg-[#215638] disabled:opacity-60">
     {working&&<LoaderCircle size={16} className="animate-spin"/>}{working?'Autorisation…':'Autoriser ChatGPT'}
    </button>
   </div>
  </div>
 </main>;
}
export function McpAuthorizePage(){
 if(!authClient)return <main className="mx-auto max-w-lg px-5 py-20 text-center text-red-700">Service de connexion indisponible.</main>;
 return <SignedInConsent/>;
}
