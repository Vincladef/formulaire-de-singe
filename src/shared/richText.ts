/** Sanitize formatting from the document editor before saving or displaying it. */
function escapeText(text:string):string{
 return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
export function sanitizeDocumentHtml(raw:string):string{
 if(typeof document==='undefined')return escapeText(raw);
 const template=document.createElement('template');template.innerHTML=raw;
 function clean(node:Node):string{
  if(node.nodeType===Node.TEXT_NODE)return escapeText(node.textContent??'');
  if(node.nodeType!==Node.ELEMENT_NODE)return '';
  const el=node as HTMLElement;
  if(['SCRIPT','STYLE','IFRAME','OBJECT','SVG','MATH'].includes(el.tagName))return '';
  if(el.tagName==='BR')return '<br>';
  const body=Array.from(el.childNodes).map(clean).join('');
  const simple:Record<string,string>={STRONG:'strong',B:'strong',I:'em',EM:'em',U:'u'};
  const tag=simple[el.tagName];
  if(tag)return '<'+tag+'>'+body+'</'+tag+'>';
  if(el.tagName==='A'){
   const href=el.getAttribute('href')??'';
   if(/^(https?:|mailto:)/i.test(href))return '<a href="'+escapeText(href)+'" rel="noopener noreferrer">'+body+'</a>';
  }
  return body;
 }
 return Array.from(template.content.childNodes).map(clean).join('');
}
