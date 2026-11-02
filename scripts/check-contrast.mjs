/** CSS theme contrast guard, standalone (no npm dependencies). */
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const theme = readFileSync(new URL('../src/components/studio/ThemePanel.tsx', import.meta.url), 'utf8');
function luminance(color){
 const normalized=color.replace('#','');
 const values=[0,2,4].map(i=>parseInt(normalized.slice(i,i+2),16)/255);
 return values.map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((total,v,i)=>total+v*[.2126,.7152,.0722][i],0);
}
function contrast(first,second){const [a,b]=[luminance(first),luminance(second)].sort((x,y)=>y-x);return (a+.05)/(b+.05);}
let total=0;
for(const [,name,color] of theme.matchAll(/(forest|ocean|clay|plum|ink):'(#\w{6})'/g)){
 const score=contrast(color,'#ffffff');
 if(score<4.5)throw new Error(`${name}: contraste texte/blanc insuffisant (${score.toFixed(2)})`);
 total++;
}
if(total!==5)throw new Error('Les cinq palettes sont requises');
if(!css.includes('@media (prefers-reduced-motion:reduce)'))throw new Error('Style de mouvement réduit absent');
console.log(`✓ ${total} couleurs d’accent respectent AA sur blanc ; préférences de mouvement réduit prises en charge`);
