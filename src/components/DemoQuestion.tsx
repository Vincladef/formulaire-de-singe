import { useState } from 'react';
import { Check, Circle, Mic, MoveUpRight } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { cn } from './ui/utils';

const choices = ['Trouver facilement mes produits', 'Gérer mon budget', 'Gagner du temps'];

export function DemoQuestion() {
  const [choice, setChoice] = useState<string>('Gagner du temps');
  const [submitted, setSubmitted] = useState(false);
  return (
    <div className="relative mx-auto max-w-[470px]">
      <Card className="relative overflow-hidden !rounded-[27px] p-7 sm:p-9 shadow-[0_28px_65px_-42px_#36594a]">
        <div className="mb-5 flex items-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#f1f5f0] px-3 py-1.5 text-xs font-semibold text-[#47725b]"><Circle size={8} fill="currentColor" /> APERÇU INTERACTIF</span>
        </div>
        {submitted ? (
          <section className="flex min-h-[300px] flex-col items-center justify-center gap-4 text-center" aria-live="polite">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e6f4e7] text-[#377d55]"><Check size={28} /></span>
            <h2 className="font-display text-2xl font-bold text-[#203d30]">Merci pour la réponse !</h2>
            <p className="text-sm text-[#607265]">C'était une démonstration locale. Rien n'a été envoyé ni enregistré.</p>
            <Button variant="secondary" onClick={() => setSubmitted(false)}>Recommencer</Button>
          </section>
        ) : (
          <>
            <p className="mt-8 text-[11px] font-bold uppercase tracking-[.17em] text-[#607265]">Habitudes & quotidien</p>
            <h2 className="font-display mt-3 mb-3 text-[25px] font-extrabold leading-[1.33] tracking-[-.045em] text-[#203d30]">Qu'est-ce qui compte le plus pendant vos courses ?</h2>
            <p className="mb-6 text-[13px] leading-6 text-[#617267]">Choisissez la réponse qui vous correspond le mieux.</p>
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
              <span className="inline-flex items-center gap-2 text-xs text-[#5d7363]"><Mic size={15} /> Réponses vocales disponibles dans le Studio</span>
              <Button onClick={() => setSubmitted(true)}>Valider <MoveUpRight size={17} /></Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
