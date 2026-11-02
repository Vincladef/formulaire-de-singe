import { useState } from 'react';
import { Check, Circle, Headphones, Mic, MoveUpRight, Sparkles } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { cn } from './ui/utils';

const choices = ['Trouver facilement mes produits', 'Gérer mon budget', 'Gagner du temps'];

export function DemoQuestion() {
  const [choice, setChoice] = useState<string>('Gagner du temps');
  const [submitted, setSubmitted] = useState(false);
  return (
    <div className="relative mx-auto max-w-[470px]">
      <div className="absolute -left-8 top-8 h-56 w-64 rounded-full bg-[#d8e6cf]/60 blur-[64px]" aria-hidden="true" />
      <div className="absolute -right-12 bottom-8 h-64 w-64 rounded-full bg-[#ffeed4]/75 blur-[65px]" aria-hidden="true" />
      <Card className="relative overflow-hidden !rounded-[27px] p-7 sm:p-9 shadow-[0_28px_65px_-42px_#36594a]">
        <div className="mb-7 flex items-center justify-between">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#f1f5f0] px-3 py-1.5 text-xs font-semibold text-[#47725b]"><Circle size={8} fill="currentColor" /> APERÇU INTERACTIF</span>
          <span className="text-xs font-semibold text-[#90a298]">01 / 03</span>
        </div>
        <div className="h-1 w-full rounded-full bg-[#edf1eb]"><div className="h-full w-1/3 rounded-full bg-[#6a9378]" /></div>
        {submitted ? (
          <section className="flex min-h-[300px] flex-col items-center justify-center gap-4 text-center" aria-live="polite">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e6f4e7] text-[#377d55]"><Check size={28} /></span>
            <h2 className="font-display text-2xl font-bold text-[#203d30]">Merci pour la réponse !</h2>
            <p className="text-sm text-[#75877b]">C'était une démonstration locale. Rien n'a été envoyé ni enregistré.</p>
            <Button variant="secondary" onClick={() => setSubmitted(false)}>Recommencer</Button>
          </section>
        ) : (
          <>
            <p className="mt-8 text-[11px] font-bold uppercase tracking-[.17em] text-[#679077]">Habitudes & quotidien</p>
            <h2 className="font-display mt-3 mb-3 text-[25px] font-extrabold leading-[1.33] tracking-[-.045em] text-[#203d30]">Qu'est-ce qui compte le plus pendant vos courses ?</h2>
            <p className="mb-6 text-[13px] leading-6 text-[#829087]">Choisissez la réponse qui vous correspond le mieux.</p>
            <fieldset className="space-y-2.5">
              <legend className="sr-only">Votre priorité</legend>
              {choices.map((value) => (
                <label key={value} className={cn('flex min-h-[55px] cursor-pointer items-center justify-between gap-3 rounded-[13px] border px-4 text-sm transition-colors', choice === value ? 'border-[#7eaa8c] bg-[#f1f8f0] text-[#24533c]' : 'border-[#e8ece7] bg-white text-[#455b4d] hover:bg-[#f9fbf8]')}>
                  <span className="font-medium">{value}</span>
                  <input className="sr-only" type="radio" name="priority" value={value} checked={choice === value} onChange={() => setChoice(value)} />
                  <span aria-hidden="true" className={cn('flex h-[19px] w-[19px] items-center justify-center rounded-full border', choice === value ? 'border-[#5f9172] bg-[#5f9172] text-white' : 'border-[#bdc9bf]')}>
                    {choice === value && <Check size={12} strokeWidth={3} />}
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="mt-7 flex items-center justify-between gap-4 border-t border-[#eff2ed] pt-6">
              <span className="inline-flex items-center gap-2 text-xs text-[#86988c]"><Mic size={15} /> Voix bientôt disponible</span>
              <Button onClick={() => setSubmitted(true)}>Valider <MoveUpRight size={17} /></Button>
            </div>
          </>
        )}
      </Card>
      <div className="absolute -bottom-8 -left-6 hidden items-center gap-2 rounded-xl border border-[#dfebe0] bg-white px-4 py-3 text-xs font-semibold text-[#4f6c58] shadow-xl shadow-[#1d3520]/5 sm:flex">
        <Headphones size={16} /> Pensé pour la voix
      </div>
      <div className="absolute -right-7 top-20 hidden rotate-6 items-center gap-2 rounded-xl border border-[#e8e7d8] bg-[#fffdf7] px-4 py-3 text-xs font-semibold text-[#957d3f] shadow-xl shadow-[#1d3520]/5 sm:flex">
        <Sparkles size={15} /> Simple, vraiment
      </div>
    </div>
  );
}
