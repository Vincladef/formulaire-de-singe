import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { ArrowUpRight, LogOut } from 'lucide-react';
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
      navigate('/connexion', { replace: true });
    } catch {
      setError('Déconnexion impossible ; réessaie.');
    } finally {
      setBusy(false);
    }
  }

  if (session.isPending || !session.data?.user) {
    return <Button asChild variant="outline" size="sm"><Link to="/studio">Ouvrir le Studio <ArrowUpRight size={16}/></Link></Button>;
  }

  return <div className="flex items-center gap-2">
    {error && <span role="alert" className="max-w-28 text-xs text-red-700">{error}</span>}
    <button
      type="button"
      onClick={() => { void logout(); }}
      disabled={busy}
      aria-busy={busy}
      title="Se déconnecter de Formulaire de Singe"
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#dce7da] bg-white px-3 text-sm font-semibold text-[#355b44] transition hover:bg-[#eef5ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#327957] disabled:opacity-60 sm:px-4"
    >
      <LogOut size={17} aria-hidden="true"/>
      <span className="sm:hidden">Quitter</span>
      <span className="hidden sm:inline">{busy ? 'Déconnexion…' : 'Se déconnecter'}</span>
    </button>
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
          <NavLink to="/" end className={({ isActive }) => isActive ? 'text-[#26553d]' : 'hover:text-[#26553d]'}>Accueil</NavLink>
          <NavLink to="/studio" className={({ isActive }) => isActive ? 'text-[#26553d]' : 'hover:text-[#26553d]'}>Studio</NavLink>
        </nav>
        <AccountActions />
      </div>
    </header>
  );
}
