import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authClient } from '../authClient';

export function AuthPage() {
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [name,setName] = useState('');
  const [register,setRegister] = useState(false);
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(false);
  const navigate = useNavigate();
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true);setError('');
    try {
      if (!authClient) throw new Error('Service de connexion indisponible');
      const result = register
        ? await authClient.signUp.email({email,password,name})
        : await authClient.signIn.email({email,password});
      if (result.error) throw new Error(result.error.message || 'Échec de la connexion');
      navigate('/studio', {replace:true});
    } catch (e) {setError(e instanceof Error ? e.message : 'Connexion impossible');}
    finally {setLoading(false);}
  }
  return <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
    <Link to="/" className="mb-8 text-sm font-semibold text-[#568468]">← Retour à l’accueil</Link>
    <h1 className="font-display text-4xl font-extrabold tracking-tight text-[#274936]">{register ? 'Créer mon compte' : 'Bienvenue au Studio'}</h1>
    <p className="mt-3 text-sm text-[#6e8173]">L’espace de création est privé. Les personnes qui répondent aux formulaires n’ont pas besoin de compte.</p>
    <form onSubmit={submit} className="mt-8 grid gap-4">
      {register && <label className="grid gap-1 text-sm font-semibold">Nom<input required className="rounded-xl border border-[#dce7da] bg-white p-3" value={name} onChange={e=>setName(e.target.value)} autoComplete="name"/></label>}
      <label className="grid gap-1 text-sm font-semibold">Adresse e-mail<input required type="email" className="rounded-xl border border-[#dce7da] bg-white p-3" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></label>
      <label className="grid gap-1 text-sm font-semibold">Mot de passe<input required minLength={8} type="password" className="rounded-xl border border-[#dce7da] bg-white p-3" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={register?'new-password':'current-password'}/></label>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button disabled={loading||!authClient} className="rounded-xl bg-[#285e43] px-5 py-3 font-bold text-white disabled:opacity-60">{loading ? 'Connexion…' : register ? 'Créer le compte' : 'Se connecter'}</button>
    </form>
    <button className="mt-5 text-sm font-semibold text-[#568468]" onClick={()=>{setRegister(v=>!v);setError('');}}>{register ? 'J’ai déjà un compte' : 'Je n’ai pas encore de compte'}</button>
  </main>;
}
