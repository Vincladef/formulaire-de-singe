import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, AudioLines, Layers3, ShieldCheck, WandSparkles } from 'lucide-react';
import { DemoQuestion } from '../components/DemoQuestion';
import { Button } from '../components/ui/button';

const features = [
  { title: 'Créez avec plaisir', description: 'Une interface qui laisse toute la place aux bonnes questions.', icon: Layers3 },
  { title: 'Laissez parler', description: 'Bientôt, des réponses audio directement au micro, sans friction.', icon: AudioLines },
  { title: 'Restez maître', description: 'Vos formulaires et leurs données, avec des accès contrôlés.', icon: ShieldCheck },
];

export function HomePage() {
  return (
    <main>
      <section className="relative overflow-hidden px-5 pt-20 pb-24 sm:px-8 lg:pt-27 lg:pb-34">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-full opacity-60 [background-image:radial-gradient(#d7e0d6_0.8px,transparent_0.8px)] [background-size:23px_23px] [mask-image:linear-gradient(to_bottom,transparent_0%,black_30%,transparent_90%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-16 lg:grid-cols-[1.03fr_.97fr] lg:gap-10">
          <div className="max-w-[565px]">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#dce8da] bg-[#eef5ec] px-4 py-2 text-[12px] font-bold tracking-[.02em] text-[#477755]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#75a777]" /> LE PROJET PREND VIE
            </span>
            <h1 className="font-display mt-8 text-[clamp(3rem,5.3vw,5.2rem)] font-extrabold leading-[1.075] tracking-[-.075em] text-[#203e30]">
              Des formulaires<br />qui donnent <span className="relative inline-block text-[#6c946a]">envie<span className="absolute right-0 bottom-0 left-0 h-[5px] rounded-full bg-[#d2e2bd]" /></span><br />de répondre.
            </h1>
            <p className="mt-7 max-w-[480px] text-[16px] leading-[1.85] text-[#637469] sm:text-[17px]">Créez des questions à votre image. Offrez à chacun une expérience simple, belle et bientôt vocale. Bienvenue dans <strong className="text-[#304e3b]">Formulaire de Singe.</strong></p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg"><Link to="/studio">Découvrir le Studio <ArrowUpRight size={19} /></Link></Button>
              <Button asChild variant="outline" size="lg"><a href="#comment-ca-marche">Comment ça marche <ArrowRight size={18} /></a></Button>
            </div>
            <div className="mt-12 flex items-center gap-4 border-t border-[#e4e9e2] pt-6 text-xs text-[#829084]">
              <span className="font-bold text-[#456850]">01 / Fondations</span>
              <span className="h-1 w-1 rounded-full bg-[#b9c9bb]" />
              <span>Interface de démonstration</span>
              <span className="h-1 w-1 rounded-full bg-[#b9c9bb]" />
              <span>Données non collectées</span>
            </div>
          </div>
          <DemoQuestion />
        </div>
      </section>
      <section id="comment-ca-marche" className="border-t border-[#e5eae2] bg-[#f1f4ee] px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-11 flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-[.17em] text-[#6f9871]">Pensé différemment</p>
              <h2 className="font-display text-[clamp(2rem,4vw,3.2rem)] font-extrabold tracking-[-.06em] text-[#203e30]">Simple dans les gestes.<br />Grand dans les idées.</h2>
            </div>
            <span className="max-w-[330px] text-sm leading-7 text-[#7b8b7f]">Une première fondation solide pour un futur outil de création et d'analyse de formulaires.</span>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {features.map(({ title, description, icon: Icon }, index) => (
              <article key={title} className="rounded-[22px] border border-[#e1e7de] bg-[#fffefa] p-7">
                <span className="mb-9 flex h-13 w-13 items-center justify-center rounded-2xl bg-[#e9f1e5] text-[#547f5b]"><Icon size={24} strokeWidth={1.8} /></span>
                <p className="mb-2 text-xs font-bold tracking-[.16em] text-[#a1b0a1]">0{index + 1}</p>
                <h3 className="font-display mb-2 text-xl font-extrabold tracking-[-.04em] text-[#2a4534]">{title}</h3>
                <p className="text-sm leading-7 text-[#7c897d]">{description}</p>
              </article>
            ))}
          </div>
          <div className="mt-9 flex items-center justify-center gap-2 text-sm font-medium text-[#7c9380]"><WandSparkles size={17} /> Le meilleur reste à construire.</div>
        </div>
      </section>
    </main>
  );
}
