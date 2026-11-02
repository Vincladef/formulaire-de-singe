import { useEffect, useRef, useState } from 'react';
import { Highlighter, Palette } from 'lucide-react';

/** A compact swatch grid like Google Docs, with the full native color picker kept as an option. */
export const presetColors=[
 '#000000','#444444','#666666','#999999','#b7b7b7','#cccccc','#d9d9d9','#eeeeee','#f3f3f3','#ffffff',
 '#980000','#ff0000','#ff9900','#ffff00','#00ff00','#00ffff','#4a86e8','#0000ff','#9900ff','#ff00ff',
 '#e6b8af','#f4cccc','#fce5cd','#fff2cc','#d9ead3','#d0e0e3','#c9daf8','#cfe2f3','#d9d2e9','#ead1dc',
 '#dd7e6b','#ea9999','#f9cb9c','#ffe599','#b6d7a8','#a2c4c9','#a4c2f4','#9fc5e8','#b4a7d6','#d5a6bd',
 '#cc4125','#e06666','#f6b26b','#ffd966','#93c47d','#76a5af','#6d9eeb','#6fa8dc','#8e7cc3','#c27ba0',
 '#a61c00','#cc0000','#e69138','#f1c232','#6aa84f','#45818e','#3c78d8','#3d85c6','#674ea7','#a64d79',
 '#85200c','#990000','#b45f06','#bf9000','#38761d','#134f5c','#1155cc','#0b5394','#351c75','#741b47',
 '#5b0f00','#660000','#783f04','#7f6000','#274e13','#0c343d','#1c4587','#073763','#20124d','#4c1130',
] as const;

type Props={
 label:string;
 kind:'text'|'highlight';
 value:string;
 onColor:(color:string)=>void;
};
export function ColorPalette({label,kind,value,onColor}:Props){
 const [open,setOpen]=useState(false);
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!open)return;
  const outside=(e:PointerEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false);};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);ref.current?.querySelector<HTMLButtonElement>('[data-palette-trigger]')?.focus();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[open]);
 const select=(color:string)=>{onColor(color);setOpen(false);};
 return <div ref={ref} className="relative">
   <button data-palette-trigger type="button" aria-label={label} title={label} aria-expanded={open} aria-haspopup="dialog"
    onMouseDown={e=>e.preventDefault()} onClick={()=>setOpen(v=>!v)}
    className="relative flex h-10 w-10 items-center justify-center rounded-lg text-[#496c52] hover:bg-[#edf4ea] focus-visible:outline-2 focus-visible:outline-[#35764b]">
    {kind==='text'?<Palette size={19}/>:<Highlighter size={19}/>}
    <span className="absolute bottom-1 h-[3px] w-5 rounded" style={{backgroundColor:value,border:'1px solid #0002'}}/>
   </button>
   {open&&<div role="dialog" aria-label={label} className="absolute right-0 top-[calc(100%+7px)] z-50 w-[292px] sm:right-auto sm:left-0 max-w-[calc(100vw-2rem)] rounded-xl border border-[#dde7db] bg-white p-3 shadow-[0_15px_35px_-12px_rgba(20,48,25,.25)]">
    <p className="mb-2 px-0.5 text-xs font-semibold text-[#48624e]">Couleurs prédéfinies</p>
    <div role="group" aria-label="Nuancier" className="grid grid-cols-10 gap-[4px]">
     {presetColors.map((color,index)=><button type="button" key={color+index}
      aria-label={'Choisir '+color} aria-pressed={color.toLowerCase()===value.toLowerCase()}
      title={color} onMouseDown={e=>e.preventDefault()} onClick={()=>select(color)}
      className={'h-[22px] w-[22px] rounded-[5px] border border-[#223a2a]/15 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#26744a] '+(color.toLowerCase()===value.toLowerCase()?'ring-2 ring-offset-1 ring-[#36764e]':'')}
      style={{backgroundColor:color}}/>)}
    </div>
    <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#e7ede5] pt-3">
     <span className="text-xs font-medium text-[#49634f]">Couleur personnalisée</span>
     <input type="color" aria-label={'Couleur personnalisée, '+label.toLowerCase()} title="Choisir une autre couleur"
      value={value} onChange={e=>select(e.target.value)}
      className="h-8 w-10 cursor-pointer rounded-md border border-[#ccd9ca] bg-white p-0.5"/>
    </div>
   </div>}
 </div>;
}
