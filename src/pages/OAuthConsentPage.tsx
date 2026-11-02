import { useEffect, useState } from 'react';
import { authClient } from '../authClient';

/** Neon Auth owns the signed OAuth request and all redirects. Never construct them here. */
export function OAuthConsentPage() {
 const [name,setName]=useState('Application connectée');
 const [scope,setScope]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(true);
 useEffect(()=>{
  let current=true;
  const params=new URLSearchParams(window.location.search);
  const clientId=params.get('client_id');
  if(!authClient||!clientId||!params.has('sig')||!params.has('ba_param')){
   setError('Demande invalide. Relancez la connexion depuis ChatGPT.');setBusy(false);return;
  }
  void(async()=>{
   try{
    const session=await authClient.getSession();
    if(!session.data?.user)throw new Error('Session expirée. Reconnectez-vous depuis ChatGPT.');
    const result=await authClient.oauth2.publicClient({query:{client_id:clientId}});
    if(result.error)throw new Error('La demande ne peut pas être vérifiée.');
    if(current){setName(result.data?.client_name||'Application connectée');setScope(params.get('scope')||'Accès à votre compte');}
   }catch(e){if(current)setError(e instanceof Error?e.message:'Autorisation indisponible.');}
   finally{if(current)setBusy(false);}
  })();
  return()=>{current=false;};
 },[]);
 async function consent(accept:boolean){
  if(!authClient||busy)return;
  setBusy(true);setError('');
  try{
   const response=await authClient.oauth2.consent({accept});
   if(response.error)throw new Error(response.error.message||'Autorisation refusée par le fournisseur.');
   // The SDK performs the signed OAuth redirect itself.
  }catch(e){setError(e instanceof Error?e.message:'Autorisation impossible.');setBusy(false);}
 }
 return <main className="mx-auto flex min-h-[65vh] max-w-lg items-center px-5 py-12">
  <section aria-labelledby="oauth-title" className="w-full rounded-3xl border border-[#e0e9de] bg-white p-8 shadow-sm">
   <p className="mb-4 text-3xl" aria-hidden="true">🐒</p>
   <h1 id="oauth-title" className="text-2xl font-semibold text-[#244733]">Autoriser l’accès à vos formulaires ?</h1>
   {busy&&!error&&!scope&&<p role="status" className="mt-4 text-sm">Vérification de la demande…</p>}
   {!!scope&&!error&&<><p className="mt-5 text-sm leading-7 text-[#506755]"><strong>{name}</strong> souhaite accéder à votre espace Formulaire de Singe.</p><div className="mt-5 rounded-2xl bg-[#f5f8f4] p-4 text-sm"><strong>Autorisations demandées :</strong><p className="mt-1 break-words">{scope}</p></div><p className="mt-4 text-xs text-[#718775]">Autorisez uniquement une application que vous reconnaissez.</p></>}
   {error&&<p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
   <div className="mt-7 flex gap-3">
    <button disabled={busy||!!error} onClick={()=>void consent(true)} className="min-h-11 rounded-xl bg-[#285e43] px-5 py-3 font-semibold text-white disabled:opacity-50">Autoriser</button>
    <button disabled={busy||!!error} onClick={()=>void consent(false)} className="min-h-11 rounded-xl border border-[#d8e4d7] px-5 py-3 font-semibold text-[#31543b] disabled:opacity-50">Refuser</button>
   </div>
  </section>
 </main>;
}
