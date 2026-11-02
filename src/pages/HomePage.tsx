import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, AudioLines, Layers3, ShieldCheck } from 'lucide-react';
import { DemoQuestion } from '../components/DemoQuestion';
import { Button } from '../components/ui/button';

const features = [
  { title: 'Créez avec plaisir', description: 'Une interface qui laisse toute la place aux bonnes questions.', icon: Layers3 },
  { title: 'Laissez parler', description: 'Des réponses audio directement au micro, sans friction.', icon: AudioLines },
  { title: 'Restez maître', description: 'Vos formulaires et leurs données, avec des accès contrôlés.', icon: ShieldCheck },
];

export function HomePage() {
  return (
    <main>
      <section className="relative overflow-hidden px-5 pt-14 pb-20 sm:px-8 lg:pt-20 lg:pb-24">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-full opacity-60 [background-image:radial-gradient(#d7e0d6_0.8px,transparent_0.8px)] [background-size:23px_23px] [mask-image:linear-gradient(to_bottom,transparent_0%,black_30%,transparent_90%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.03fr_.97fr] lg:gap-12">
          <div className="max-w-[565px]">
            <h1 className="font-display text-[clamp(3rem,5.3vw,5.2rem)] font-extrabold leading-[1.075] tracking-[-.075em] text-[#203e30]">
              Des formulaires<br />qui donnent <span className="relative inline-block text-[#6c946a]">envie<span className="absolute right-0 bottom-0 left-0 h-[5px] rounded-full bg-[#d2e2bd]" /></span><br />de répondre.
            </h1>
            <p className="mt-7 max-w-[480px] text-[16px] leading-[1.85] text-[#637469] sm:text-[17px]">Créez des questions à votre image. Offrez à chacun une expérience simple, belle et vocale. Bienvenue dans <strong className="text-[#304e3b]">Formulaire de Singe.</strong></p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg"><Link to="/studio">Découvrir le Studio <ArrowUpRight size={19} /></Link></Button>
              <a className="inline-flex min-h-12 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[#315d41] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-[#315d41]" href="#comment-ca-marche">Comment ça marche <ArrowRight size={16} /></a>
            </div>
          </div>
          <DemoQuestion />
        </div>
      </section>
      <section id="comment-ca-marche" className="border-t border-[#e5eae2] bg-[#f1f4ee] px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-11 flex flex-wrap items-end justify-between gap-6">
            <div>
              <h2 className="font-display text-[clamp(2rem,4vw,3.2rem)] font-extrabold tracking-[-.06em] text-[#203e30]">Simple dans les gestes.<br />Grand dans les idées.</h2>
            </div>
            <span className="max-w-[330px] text-sm leading-7 text-[#7b8b7f]">Créez et publiez vos formulaires ; consultez ensuite les réponses depuis le Studio.</span>
          </div>
          <div className="grid gap-5 border-t border-[#d8e4d6] pt-6 md:grid-cols-3">
            {features.map(({ title, description, icon: Icon }, index) => (
              <article key={title} className="px-1 py-3">
                <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-[#e0ecdd] text-[#315f42]"><Icon size={24} strokeWidth={1.8} /></span>
                <p className="mb-2 text-xs font-bold tracking-[.12em] text-[#59705f]">0{index + 1}</p>
                <h3 className="font-display mb-2 text-xl font-extrabold tracking-[-.04em] text-[#2a4534]">{title}</h3>
                <p className="text-sm leading-7 text-[#607265]">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
