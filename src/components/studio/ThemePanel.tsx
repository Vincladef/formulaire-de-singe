import { Check, Palette } from 'lucide-react';
import { themeOptions, type FormTheme } from '../../shared/theme';

const accentColors: Record<FormTheme['accent'], string> = {
 forest:'#286047', ocean:'#245b83', clay:'#975137', plum:'#724674', ink:'#303b43',
};
const fields: Array<{key: keyof FormTheme; label: string; hint: string}> = [
 { key:'accent', label:'Couleur principale', hint:'Une couleur pour guider le regard.' },
 { key:'font', label:'Typographie', hint:'La personnalité du questionnaire.' },
 { key:'background', label:'Arrière-plan', hint:'Un espace calme pour répondre.' },
 { key:'button', label:'Style des boutons', hint:'Des actions faciles à repérer.' },
 { key:'layout', label:'Présentation', hint:'Tout voir, ou avancer une question à la fois.' },
];
export function ThemePanel({theme,onChange,disabled=false}: {theme:FormTheme;onChange:(theme:FormTheme)=>void;disabled?:boolean}) {
 return <section aria-label="Apparence du formulaire" className="theme-panel space-y-6">
  <div className="flex items-start gap-2"><Palette size={19} className="mt-0.5 text-[#3d7157]"/><div><h3 className="font-display text-lg font-bold">Une identité à toi.</h3><p className="mt-1 text-xs leading-5 text-[#798477]">Modifie le style, puis prévisualise le résultat.</p></div></div>
  {fields.map(({key,label,hint})=><fieldset className="space-y-2" key={key} disabled={disabled}>
   <legend className="text-sm font-bold text-[#35483d]">{label}</legend>
   <p className="text-xs leading-5 text-[#819084]">{hint}</p>
   <div className={`grid gap-2 ${key==='accent'?'grid-cols-5':'grid-cols-2'}`}>
    {themeOptions[key].map(item=><button type="button" key={item.value} disabled={disabled}
      aria-pressed={theme[key]===item.value} title={item.label}
      onClick={()=>onChange({...theme,[key]:item.value})}
      className={`theme-option flex min-h-10 items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 ${theme[key]===item.value?'border-[#47745b] bg-[#ecf3e9] text-[#234a36] ring-1 ring-[#b7d0bc]':'border-[#e5e9e1] bg-white text-[#66766a] hover:bg-[#f4f6f1]'}`}>
       {key==='accent'?<span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full text-white" style={{background:accentColors[item.value as FormTheme['accent']]}}>{theme.accent===item.value?<Check size={14}/>:null}</span>:<>{theme[key]===item.value?<Check size={13}/>:null}{item.label}</>}
       {key==='accent'&&<span className="sr-only">{item.label}</span>}
      </button>)}
   </div>
  </fieldset>)}
  <p className="border-t border-[#e8ece6] pt-4 text-xs leading-5 text-[#819084]">L’apparence est conservée dans Neon. Elle s’applique au lien public après sauvegarde.</p>
 </section>;
}
