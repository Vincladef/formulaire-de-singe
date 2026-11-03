import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { authClient } from '../authClient';

export function AuthPage() {
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [name,setName] = useState('');
  const [register,setRegister] = useState(false);
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(false);
  const [googleLoading,setGoogleLoading] = useState(false);
  const navigate = useNavigate();
  const location=useLocation();
  const requestedReturn=new URLSearchParams(location.search).get('returnTo');
  // Only our own ChatGPT consent screen can be used as a post-login destination.
  const returnTo=requestedReturn?.startsWith('/autoriser-chatgpt?')?requestedReturn:'/studio';
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true);setError('');
    try {
      if (!authClient) throw new Error('Service de connexion indisponible');
      const result = register
        ? await authClient.signUp.email({email,password,name})
        : await authClient.signIn.email({email,password});
      if (result.error) throw new Error(result.error.message || 'Échec de la connexion');
      navigate(returnTo, {replace:true});
    } catch (e) {setError(e instanceof Error ? e.message : 'Connexion impossible');}
    finally {setLoading(false);}
  }
  async function signInWithGoogle() {
    if (loading || googleLoading) return;
    setError('');
    setGoogleLoading(true);
    try {
      if (!authClient) throw new Error('Service de connexion indisponible');
      // Neon Auth gère le flux OAuth Google et la session ; aucune clé Google côté client.
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: `${window.location.origin}${returnTo}`,
      });
      if (result.error) throw new Error(result.error.message || 'Connexion Google impossible');
      // Le SDK réalise normalement la redirection OAuth automatiquement.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connexion Google impossible');
    } finally {
      setGoogleLoading(false);
    }
  }
  return <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
    <Link to="/" className="mb-8 text-sm font-semibold text-[#568468]">← Retour à l’accueil</Link>
    <h1 className="font-display text-4xl font-extrabold tracking-tight text-[#274936]">{register ? 'Créer mon compte' : 'Bienvenue au Studio'}</h1>
    <p className="mt-3 text-sm text-[#6e8173]">L’espace de création est privé. Les personnes qui répondent aux formulaires n’ont pas besoin de compte.</p>
    <button
      type="button"
      onClick={() => { void signInWithGoogle(); }}
      disabled={loading || googleLoading || !authClient}
      className="mt-8 flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-[#dce7da] bg-white px-5 py-3 text-sm font-semibold text-[#253d30] shadow-sm transition-colors hover:bg-[#f3f7f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#285e43] disabled:cursor-not-allowed disabled:opacity-60"
      aria-busy={googleLoading}
    >
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.36 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.28 5.48-4.8 7.18l7.73 6C44.37 38.05 46.98 31.9 46.98 24.55z" />
        <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.92-2.13 15.88-5.8l-7.73-6c-2.14 1.44-4.88 2.3-8.15 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.97 6.19C6.5 42.62 14.62 48 24 48z" />
      </svg>
      {googleLoading ? 'Redirection vers Google…' : 'Continuer avec Google'}
    </button>
    <div className="my-6 flex items-center gap-4 text-xs font-medium text-[#829386]" aria-hidden="true">
      <span className="h-px flex-1 bg-[#e2e9e0]" />
      <span>ou avec une adresse e-mail</span>
      <span className="h-px flex-1 bg-[#e2e9e0]" />
    </div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <form onSubmit={submit} className="grid gap-4">
      {register && <label className="grid gap-1 text-sm font-semibold">Nom<input required className="rounded-xl border border-[#dce7da] bg-white p-3" value={name} onChange={e=>setName(e.target.value)} autoComplete="name"/></label>}
      <label className="grid gap-1 text-sm font-semibold">Adresse e-mail<input required type="email" className="rounded-xl border border-[#dce7da] bg-white p-3" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></label>
      <label className="grid gap-1 text-sm font-semibold">Mot de passe<input required minLength={8} type="password" className="rounded-xl border border-[#dce7da] bg-white p-3" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={register?'new-password':'current-password'}/></label>
      <button disabled={loading||googleLoading||!authClient} className="rounded-xl bg-[#285e43] px-5 py-3 font-bold text-white disabled:opacity-60">{loading ? 'Connexion…' : register ? 'Créer le compte' : 'Se connecter'}</button>
    </form>
    <button type="button" disabled={loading || googleLoading} className="mt-5 text-sm font-semibold text-[#568468] disabled:opacity-60" onClick={()=>{setRegister(v=>!v);setError('');}}>{register ? 'J’ai déjà un compte' : 'Je n’ai pas encore de compte'}</button>
  </main>;
}
