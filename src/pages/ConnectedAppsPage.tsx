import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Link2, ShieldCheck, Trash2, LoaderCircle, ArrowLeft } from 'lucide-react';
import { getAccessToken } from '../authClient';
type Connection={id:string;clientId:string;scopes:string[];createdAt:string;expiresAt:string};
export function ConnectedAppsPage(){
 const [items,setItems]=useState<Connection[]>([]);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState('');
 const [error,setError]=useState('');
 const refresh=useCallback(async()=>{
  const token=await getAccessToken();
  if(!token)throw Error('Connexion expirée. Connecte-toi de nouveau.');
  const res=await fetch('/api/mcp/connections',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
  if(!res.ok)throw Error('Impossible de consulter les connexions.');
  const data=await res.json() as {connections:Connection[]};
  setItems(data.connections??[]);
 },[]);
 useEffect(()=>{void refresh().catch(e=>setError(e instanceof Error?e.message:'Connexion indisponible')).finally(()=>setLoading(false));},[refresh]);
 async function revoke(id:string){
  if(busy)return;setBusy(id);setError('');
  try{
   const token=await getAccessToken();
   if(!token)throw Error('Connexion expirée.');
   const res=await fetch('/api/mcp/connections/'+encodeURIComponent(id),{
    method:'DELETE',headers:{Authorization:`Bearer ${token}`},cache:'no-store',
   });
   if(!res.ok)throw Error('Révocation impossible.');
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Erreur de déconnexion.');}
  finally{setBusy('');}
 }
 return <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-16">
  <Link to="/studio" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#4e775a]"><ArrowLeft size={17}/> Retour au Studio</Link>
  <h1 className="font-display mt-4 text-3xl font-bold tracking-tight text-[#294b37]">Mes connexions</h1>
  <p className="mt-3 leading-7 text-[#627967]">Applications autorisées à accéder à Monk Form. Tu peux révoquer leurs jetons sans supprimer tes questionnaires.</p>
  {error&&<p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
  {loading?<p role="status" className="mt-10 flex gap-2 text-[#426a4d]"><LoaderCircle className="animate-spin"/>Chargement…</p>:
   items.length===0?<div className="mt-8 rounded-2xl border border-[#dae7da] bg-white p-8 text-center"><Link2 className="mx-auto text-[#779c7b]"/><p className="mt-3 text-sm text-[#526c58]">Aucune application connectée actuellement.</p></div>:
   <div className="mt-8 space-y-3">{items.map(item=><div key={item.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#dae7da] bg-white p-5">
    <ShieldCheck className="shrink-0 text-[#438050]" size={22}/>
    <div className="min-w-0 flex-1">
     <p className="font-semibold text-[#284935]">{item.clientId.includes('chatgpt.com')?'ChatGPT':'Application connectée'}</p>
     <p className="mt-1 text-xs leading-5 text-[#6b7f6e]">Depuis le {new Date(item.createdAt).toLocaleDateString('fr-FR')} · {item.scopes.filter(s=>s!=='offline_access').join(', ')}</p>
    </div>
    <button type="button" onClick={()=>void revoke(item.id)} disabled={!!busy}
     className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#e7d7d4] px-3 text-sm font-semibold text-[#9b4d45] hover:bg-red-50 disabled:opacity-60">
     {busy===item.id?<LoaderCircle size={16} className="animate-spin"/>:<Trash2 size={16}/>} Révoquer
    </button>
   </div>)}</div>}
 </main>;
}
