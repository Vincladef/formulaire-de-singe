import { Link, NavLink } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { MonkeyMark } from './MonkeyMark';
import { Button } from './ui/button';

export function SiteHeader() {
  return (
    <header className="border-b border-[#e9ede7] bg-[#fbfcfa]/90">
      <div className="mx-auto flex h-[82px] max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link to="/" className="flex items-center gap-3" aria-label="Formulaire de Singe, accueil">
          <MonkeyMark size={43} />
          <span className="font-display text-[18px] font-extrabold tracking-[-.045em] leading-[1.08] text-[#1d392e]">FORMULAIRE<br /><span className="text-[#4c7864]">DE SINGE</span></span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-semibold text-[#4a5d51] sm:flex" aria-label="Navigation principale">
          <NavLink to="/" end className={({ isActive }) => isActive ? 'text-[#26553d]' : 'hover:text-[#26553d]'}>Accueil</NavLink>
          <NavLink to="/studio" className={({ isActive }) => isActive ? 'text-[#26553d]' : 'hover:text-[#26553d]'}>Studio</NavLink>
        </nav>
        <Button asChild variant="outline" size="sm">
          <Link to="/studio">Ouvrir le Studio <ArrowUpRight size={16} /></Link>
        </Button>
      </div>
    </header>
  );
}
