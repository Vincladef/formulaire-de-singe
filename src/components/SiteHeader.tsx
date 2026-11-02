import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, LogOut, CircleUserRound } from 'lucide-react';
import { authClient } from '../authClient';
import { MonkeyMark } from './MonkeyMark';
import { Button } from './ui/button';

function AccountActions() {
  // The hook stays inside an authenticated-client-only component.
  if (!authClient) return <Button asChild variant="outline" size="sm"><Link to="/studio">Ouvrir le Studio <ArrowUpRight size={16}/></Link></Button>;
  return <SignedInActions/>;
}

function SignedInActions() {
  const session = authClient!.useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function logout() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await authClient!.signOut();
      if (result.error) throw new Error(result.error.message || 'Déconnexion impossible');
      navigate('/', { replace: true });
    } catch {
      setError('Déconnexion impossible ; réessaie.');
    } finally {
      setBusy(false);
    }
  }

  if (session.isPending || !session.data?.user) {
    return <Button asChild variant="outline" size="sm"><Link to="/studio">Ouvrir le Studio <ArrowUpRight size={16}/></Link></Button>;
  }

  return <div className="relative flex items-center gap-2">
    {error && <span role="alert" className="max-w-40 text-xs text-red-700">{error}</span>}
    <details className="group relative">
      <summary aria-label="Menu du compte" className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full border border-[#dce7da] bg-white text-[#41674b] transition hover:bg-[#eef5ed] focus-visible:outline-2 focus-visible:outline-[#327957] [&::-webkit-details-marker]:hidden">
        <CircleUserRound size={23} aria-hidden="true"/>
      </summary>
      <div className="absolute right-0 top-12 z-50 min-w-44 rounded-xl border border-[#e0e9de] bg-white p-1.5 shadow-lg">
        <p className="border-b border-[#edf1e9] px-3 py-2 text-xs text-[#7a907e]">Mon compte</p>
        <button type="button" disabled={busy} onClick={()=>void logout()} aria-busy={busy}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-[#436b50] hover:bg-[#f1f6ef] disabled:opacity-50">
          <LogOut size={16}/>{busy?'Déconnexion…':'Se déconnecter'}
        </button>
      </div>
    </details>
  </div>;
}

export function SiteHeader() {
  return (
    <header className="border-b border-[#e9ede7] bg-[#fbfcfa]/90">
      <div className="mx-auto flex h-[82px] max-w-6xl items-center justify-between gap-2 px-4 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5 sm:gap-3" aria-label="Formulaire de Singe, accueil">
          <MonkeyMark size={43} />
          <span className="font-display text-[18px] font-extrabold tracking-[-.045em] leading-[1.08] text-[#1d392e]">FORMULAIRE<br /><span className="text-[#4c7864]">DE SINGE</span></span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-semibold text-[#4a5d51] sm:flex" aria-label="Navigation principale">
          <Link to="/studio" className="text-[#486750] hover:text-[#26553d]">Mes formulaires</Link>
        </nav>
        <AccountActions />
      </div>
    </header>
  );
}
