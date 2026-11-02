import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowUpRight, ChevronDown, LogOut, CircleUserRound } from 'lucide-react';
import { authClient } from '../authClient';
import { MonkeyMark } from './MonkeyMark';
import { Button } from './ui/button';

function AccountActions() {
  // The hook stays inside an authenticated-client-only component.
  if (!authClient) return null;
  return <SignedInActions/>;
}

function SignedInActions() {
  const session = authClient!.useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const menuRef = useRef<HTMLDetailsElement>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // A native disclosure keeps keyboard semantics. Close it when clicking
  // anywhere else, pressing Escape or navigating to a new page.
  useEffect(() => {
    const onOutsidePointer = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        menuRef.current.open = false;
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !menuRef.current?.open) return;
      event.preventDefault();
      menuRef.current.open = false;
      menuRef.current.querySelector<HTMLElement>('summary')?.focus();
    };
    document.addEventListener('pointerdown', onOutsidePointer);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('pointerdown', onOutsidePointer);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);
  useEffect(() => {
    if (menuRef.current) menuRef.current.open = false;
  }, [pathname]);

  async function logout() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await authClient!.signOut();
      if (result.error) throw new Error(result.error.message || 'Déconnexion impossible');
      if (menuRef.current) menuRef.current.open = false;
      navigate('/', { replace: true });
    } catch {
      setError('Déconnexion impossible ; réessaie.');
    } finally {
      setBusy(false);
    }
  }

  if (session.isPending || !session.data?.user) {
    return <Button asChild variant="outline" size="sm"><Link to="/connexion">Se connecter <ArrowUpRight size={16}/></Link></Button>;
  }

  return <div className="relative flex min-w-0 items-center justify-end gap-2">
    {error && <span role="alert" className="max-w-40 text-xs text-red-700">{error}</span>}
    <details ref={menuRef} className="group relative shrink-0">
      <summary aria-label="Menu du compte" className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-[#dce7da] bg-white px-3 text-sm font-semibold text-[#365940] transition hover:bg-[#eef5ed] focus-visible:outline-2 focus-visible:outline-[#327957] [&::-webkit-details-marker]:hidden">
        <CircleUserRound size={21} aria-hidden="true"/>
        <span className="hidden sm:inline">Mon compte</span>
        <ChevronDown size={15} className="hidden text-[#587662] transition-transform group-open:rotate-180 sm:block" aria-hidden="true"/>
      </summary>
      <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-48 rounded-xl border border-[#e0e9de] bg-white p-1.5 shadow-[0_12px_35px_-15px_rgba(29,60,38,.35)]">
        <button type="button" disabled={busy} onClick={()=>void logout()} aria-busy={busy}
          className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium text-[#365940] hover:bg-[#f1f6ef] focus-visible:outline-2 focus-visible:outline-[#327957] disabled:opacity-50">
          <LogOut size={17}/>{busy?'Déconnexion…':'Se déconnecter'}
        </button>
      </div>
    </details>
  </div>;
}

export function SiteHeader() {
  return (
    <header className="border-b border-[#e4ebe2] bg-white">
      <div className="mx-auto flex h-[70px] w-full max-w-[1550px] items-center justify-between gap-4 px-4 sm:px-7">
        <Link to="/" className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-[#327957] sm:gap-3" aria-label="Formulaire de Singe, accueil">
          <MonkeyMark size={36} />
          <span className="font-display text-[15px] font-extrabold leading-[1.08] tracking-[-.045em] text-[#1d392e]">FORMULAIRE<br /><span className="text-[#4c7864]">DE SINGE</span></span>
        </Link>
        <AccountActions />
      </div>
    </header>
  );
}
