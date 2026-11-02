/** Limited rich-text HTML allowlist shared by the editor and public questionnaire.
 * Images are embedded, resized clipboard content, not arbitrary remote trackers.
 */
const MAX_INLINE_IMAGE_CHARS=250000;
function escapeText(text:string):string{
 return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
export function allowedInlineImage(src:string):boolean{
 if(src.length>MAX_INLINE_IMAGE_CHARS)return false;
 const match=/^data:image\/(?:png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(src);
 return !!match && match[1].length>=16;
}
function hex(n:number):string{return Math.max(0,Math.min(255,n)).toString(16).padStart(2,'0');}
function safeColor(value:string):string|null{
 const text=value.trim();
 if(/^#[a-f\d]{6}$/i.test(text))return text.toLowerCase();
 if(/^#[a-f\d]{3}$/i.test(text))return '#'+text.slice(1).split('').map(c=>c+c).join('').toLowerCase();
 const rgb=/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*1(?:\.0+)?\s*)?\)$/i.exec(text);
 if(rgb){
  const nums=rgb.slice(1,4).map(Number);
  if(nums.every(n=>n<=255))return '#'+nums.map(hex).join('');
 }
 return null;
}
export function sanitizeDocumentHtml(raw:string):string{
 if(typeof document==='undefined')return escapeText(raw);
 const template=document.createElement('template');template.innerHTML=raw;
 function clean(node:Node):string{
  if(node.nodeType===Node.TEXT_NODE)return escapeText(node.textContent??'');
  if(node.nodeType!==Node.ELEMENT_NODE)return '';
  const el=node as HTMLElement;
  if(['SCRIPT','STYLE','IFRAME','OBJECT','SVG','MATH','FORM','INPUT','VIDEO','AUDIO'].includes(el.tagName))return '';
  if(el.tagName==='BR')return '<br>';
  if(el.tagName==='IMG'){
   const src=el.getAttribute('src')??'';
   if(!allowedInlineImage(src))return '';
   const alt=escapeText((el.getAttribute('alt')||'Image du formulaire').slice(0,180));
   return '<img src="'+src+'" alt="'+alt+'" class="my-3 max-w-full h-auto rounded-lg" loading="lazy">';
  }
  const body=Array.from(el.childNodes).map(clean).join('');
  const basic:Record<string,string>={STRONG:'strong',B:'strong',I:'em',EM:'em',U:'u',S:'s',STRIKE:'s',DEL:'s',MARK:'mark'};
  const basicTag=basic[el.tagName];
  if(basicTag)return '<'+basicTag+'>'+body+'</'+basicTag+'>';
  if(el.tagName==='A'){
   const href=el.getAttribute('href')??'';
   if(/^(https?:|mailto:)/i.test(href))return '<a href="'+escapeText(href)+'" rel="noopener noreferrer">'+body+'</a>';
  }
  if(el.tagName==='SPAN'||el.tagName==='FONT'){
   const style=el.style;
   const fore=safeColor(el.getAttribute('color')??style.color??'');
   const background=safeColor(style.backgroundColor??'');
   const size=el.getAttribute('size');
   const sizeMap=['','12px','13px','16px','18px','24px','30px','36px'];
   const declared=size&&/^[1-7]$/.test(size)?sizeMap[Number(size)]:style.fontSize;
   const pixels=/^(\d{2})px$/.exec(declared??'');
   const px=pixels?Number(pixels[1]):0;
   const properties=[
    fore?'color:'+fore:null,
    background?'background-color:'+background:null,
    px>=12&&px<=36?'font-size:'+px+'px':null,
   ].filter(Boolean);
   if(properties.length)return '<span style="'+properties.join(';')+'">'+body+'</span>';
  }
  return body;
 }
 return Array.from(template.content.childNodes).map(clean).join('');
}
