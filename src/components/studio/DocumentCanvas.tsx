import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { Bold, Italic, Plus, Slash, Type } from 'lucide-react';
import { audioMode } from '../../shared/audio';
import { OTHER_VALUE } from '../../shared/publicForm';
import { duplicateQuestion, makeQuestion, questionTypeNames, questionTypes, type QuestionType, type StudioPageData, type StudioQuestion } from '../../shared/studio';

type Props = {
 page: StudioPageData;
 editable: boolean;
 onChange: (page: StudioPageData) => void;
 onSelectQuestion: (id: string) => void;
 onOpenSettings: (id: string) => void;
 onDeleteQuestion: (id: string) => void;
};
export type DocumentCanvasHandle = {
 insert: (type: QuestionType) => void;
 focus: () => void;
};

const placeholderLine = 'Votre texte ici…';
const maxText = 10000;
const textTypes = ['P','DIV','H2','BLOCKQUOTE'];

function escapeText(text: string): string {
 return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/** Keep only document formatting. Never write arbitrary pasted HTML to public forms. */
export function sanitizeDocumentHtml(raw: string): string {
 if(typeof document==='undefined')return escapeText(raw);
 const template=document.createElement('template');
 template.innerHTML=raw;
 function clean(node:Node):string {
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
function el(tag:string,cls:string,text?:string):HTMLElement{
 const result=document.createElement(tag);
 result.className=cls;
 if(text!==undefined)result.textContent=text;
 return result;
}
function makeLine(question?:StudioQuestion):HTMLElement {
 const style=question?.settings.textStyle;
 const tag=style==='heading'?'h2':style==='quote'?'blockquote':'p';
 const line=el(tag,tag==='h2'?'my-4 text-2xl font-bold tracking-tight text-[#274632]':tag==='blockquote'?'my-4 border-l-[3px] border-[#a1bca3] pl-4 italic leading-8 text-[#49634f]':'my-2 min-h-8 text-base leading-8 text-[#2c4535]');
 line.dataset.lineId=question?.id??crypto.randomUUID();
 if(question?.label&&question.label!==placeholderLine){
  const saved=question.settings.richHtml;
  if(typeof saved==='string')line.innerHTML=sanitizeDocumentHtml(saved);
  else line.textContent=question.label;
 }
 line.dataset.placeholder=tag==='p'?'Écris ici…':'';
 line.dataset.empty=String(!line.textContent?.trim());
 return line;
}
function textField(kind:string,value:string,placeholder:string,classes:string):HTMLInputElement{
 const input=document.createElement('input');
 input.type='text';input.value=value;input.placeholder=placeholder;input.dataset.field=kind;
 input.className=classes;input.maxLength=kind==='label'?600:3000;
 input.setAttribute('aria-label',kind==='label'?'Intitulé de la question':'Description de la question');
 return input;
}
function action(label:string,id:string):HTMLButtonElement {
 const button=el('button','min-h-9 rounded-md px-2.5 text-xs font-medium text-[#4f7058] hover:bg-[#edf4ec] focus-visible:outline-2 focus-visible:outline-[#36754a]',label) as HTMLButtonElement;
 button.type='button';button.dataset.action=id;button.setAttribute('aria-label',label);
 return button;
}
function questionNode(q:StudioQuestion,index:number):HTMLElement {
 const block=el('section','group relative my-3 rounded-lg border-l-2 border-transparent py-2 pl-3 transition hover:border-[#bdd4bd] focus-within:border-[#77a281]');
 block.dataset.questionId=q.id;block.contentEditable='false';block.setAttribute('role','group');block.setAttribute('aria-label',q.label);
 const meta=el('div','mb-1 flex items-center justify-between gap-3');
 meta.appendChild(el('span','text-xs font-semibold text-[#617866]',String(index+1).padStart(2,'0')+' · '+questionTypeNames[q.type]));
 const actionBar=el('div','flex items-center gap-1 opacity-60 transition group-hover:opacity-100 group-focus-within:opacity-100');
 actionBar.append(action('Options','settings'),action('Dupliquer','duplicate'),action('Supprimer','delete'));
 meta.appendChild(actionBar);block.appendChild(meta);
 block.appendChild(textField('label',q.label==='Votre question'?'':q.label,'Écris ta question…','block h-auto min-h-10 w-full rounded-md border-0 bg-transparent p-1 text-lg font-semibold text-[#294b36] outline-none placeholder:text-[#738b78] focus:bg-[#f6faf5]'));
 block.appendChild(textField('description',q.description??'','Ajouter une indication (facultatif)','block min-h-9 w-full rounded-md border-0 bg-transparent p-1 text-sm text-[#617668] outline-none placeholder:text-[#819484] focus:bg-[#f6faf5]'));
 const answer=el('div','mt-1 px-1 pb-2 text-sm text-[#6e8373]');
 if(['short_text','long_text','number','date'].includes(q.type))answer.appendChild(el('p','border-b border-dashed border-[#b9cdbb] py-2',q.type==='number'?'0':q.type==='date'?'JJ / MM / AAAA':'Réponse du participant…'));
 if(q.type==='audio'||audioMode(q.type,q.settings)!=='text')answer.appendChild(el('p','py-2 text-[#427453]','🎙 Réponse vocale'));
 if(q.type==='select')answer.appendChild(el('p','rounded-md border border-[#d8e5d9] px-3 py-2','Choisir une option…'));
 if(['single_choice','multiple_choice','select'].includes(q.type)){
  for(const [i,opt] of q.options.entries()){
   const row=el('div','flex min-h-9 items-center gap-2');
   row.appendChild(el('span','text-[#7f9b85]',q.type==='multiple_choice'?'☐':'◯'));
   const option=textField('option',opt.label,'Option '+(i+1),'min-h-9 min-w-0 flex-1 rounded-md bg-transparent px-1 text-sm text-[#44674e] outline-none focus:bg-[#f1f7ee]');
   option.dataset.optionId=opt.id;option.setAttribute('aria-label','Choix '+(i+1));
   row.appendChild(option);
   if(q.options.length>2&&opt.value!==OTHER_VALUE){const del=action('×','remove-option');del.dataset.optionId=opt.id;row.appendChild(del);}
   answer.appendChild(row);
  }
  const add=action('+ Ajouter un choix','add-option');add.className+=' mt-1';answer.appendChild(add);
  if(!q.options.some(o=>o.value===OTHER_VALUE))answer.appendChild(action('+ Autre','add-other'));
 }
 block.appendChild(answer);
 return block;
}
function closestLine(node:Node|null,root:HTMLElement):HTMLElement|null {
 let result=node instanceof HTMLElement?node:node?.parentElement??null;
 while(result&&result.parentElement!==root)result=result.parentElement;
 return result?.parentElement===root?result:null;
}
function closestQuestion(node:EventTarget|null):HTMLElement|null {
 return node instanceof Element?node.closest<HTMLElement>('[data-question-id]'):null;
}
function setCaretAtStart(node:HTMLElement){
 node.focus();
 const range=document.createRange();range.selectNodeContents(node);range.collapse(true);
 const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range);
}
function createEmptyParagraph():HTMLElement{return makeLine();}

export const DocumentCanvas=forwardRef<DocumentCanvasHandle,Props>(function DocumentCanvas({page,editable,onChange,onSelectQuestion,onOpenSettings,onDeleteQuestion}:Props,ref){
 const root=useRef<HTMLDivElement>(null);
 const pageRef=useRef(page);
 const onChangeRef=useRef(onChange);
 const onSelectRef=useRef(onSelectQuestion);
 const onSettingsRef=useRef(onOpenSettings);
 const onDeleteRef=useRef(onDeleteQuestion);
 const savedRange=useRef<Range|null>(null);
 const lastEmitted=useRef('');
 const [menu,setMenu]=useState<{top:number;left:number}|null>(null);
 const [filter,setFilter]=useState('');
 const menuInput=useRef<HTMLInputElement>(null);
 onChangeRef.current=onChange;onSelectRef.current=onSelectQuestion;
 onSettingsRef.current=onOpenSettings;onDeleteRef.current=onDeleteQuestion;

 const build=useCallback((data:StudioPageData)=>{
  const editor=root.current;if(!editor)return;
  const fragment=document.createDocumentFragment();
  const title=el('h1','mb-3 min-h-12 text-3xl font-bold tracking-tight text-[#294b36] sm:text-4xl',data.title==='Nouvelle page'?'':data.title);
  title.dataset.role='title';title.dataset.placeholder='Titre du formulaire';title.dataset.empty=String(!title.textContent?.trim());
  fragment.appendChild(title);
  const intro=el('p','mb-7 min-h-8 text-sm leading-7 text-[#536a59]',data.description??'');
  intro.dataset.role='description';intro.dataset.placeholder='Ajouter une introduction…';intro.dataset.empty=String(!intro.textContent?.trim());
  fragment.appendChild(intro);
  let hasLine=false;
  for(const [i,q] of data.questions.entries()){
   if(q.type==='statement'){
    if(!q.label.trim()||q.label===placeholderLine)continue;
    fragment.appendChild(makeLine(q));hasLine=true;
   } else {
    fragment.appendChild(questionNode(q,data.questions.slice(0,i+1).filter(item=>item.type!=='statement').length-1));
   }
  }
  const last=fragment.lastChild;
  if(!hasLine||last instanceof HTMLElement&&last.dataset.questionId)fragment.appendChild(createEmptyParagraph());
  editor.replaceChildren(fragment);
  savedRange.current=null;setMenu(null);
 },[]);

 useLayoutEffect(()=>{
  const hash=JSON.stringify(page);
  if(hash===lastEmitted.current){pageRef.current=page;return;}
  pageRef.current=page;build(page);
 },[page,build]);

 function snapshot():StudioPageData{
  const editor=root.current;if(!editor)return pageRef.current;
  const previous=pageRef.current;
  const map=new Map(previous.questions.map(q=>[q.id,q]));
  const questions:StudioQuestion[]=[];
  const title=editor.querySelector<HTMLElement>('[data-role="title"]');
  const intro=editor.querySelector<HTMLElement>('[data-role="description"]');
  for(const child of Array.from(editor.children)){
   if(!(child instanceof HTMLElement))continue;
   if(child.dataset.role)continue;
   if(child.dataset.questionId){
    const original=map.get(child.dataset.questionId);if(!original)continue;
    const label=child.querySelector<HTMLInputElement>('[data-field="label"]')?.value.trim()||original.label;
    const description=child.querySelector<HTMLInputElement>('[data-field="description"]')?.value.trim()||null;
    const optionFields=Array.from(child.querySelectorAll<HTMLInputElement>('[data-option-id][data-field="option"]'));
    const options=original.options.map(o=>({...o,label:optionFields.find(f=>f.dataset.optionId===o.id)?.value.trim()||o.label}));
    questions.push({...original,label,description,options});
   }else if(textTypes.includes(child.tagName)||child.dataset.lineId){
    const label=(child.textContent??'').trim();
    child.dataset.empty=String(!label);
    if(!label)continue;
    const original=map.get(child.dataset.lineId??'');
    const template=original?.type==='statement'?original:makeQuestion('statement');
    const textStyle=child.tagName==='H2'?'heading':child.tagName==='BLOCKQUOTE'?'quote':'paragraph';
    const id=child.dataset.lineId??crypto.randomUUID();
    child.dataset.lineId=id;
    questions.push({...template,id,type:'statement',label:label.slice(0,maxText),
     description:null,required:false,options:[],
     settings:{...template.settings,textStyle,richHtml:sanitizeDocumentHtml(child.innerHTML)}});
   }
  }
  const nextTitle=(title?.textContent??'').trim();
  const nextIntro=(intro?.textContent??'').trim();
  if(title)title.dataset.empty=String(!nextTitle);
  if(intro)intro.dataset.empty=String(!nextIntro);
  return {...previous,title:nextTitle,description:nextIntro||null,questions};
 }
 function emit(){
  const result=snapshot();
  pageRef.current=result;lastEmitted.current=JSON.stringify(result);
  onChangeRef.current(result);
 }
 function ensureEnd(){
  const editor=root.current;if(!editor)return;
  const last=editor.lastElementChild;
  if(!last||last instanceof HTMLElement&&last.dataset.questionId)editor.appendChild(createEmptyParagraph());
 }
 function remember(){
  const editor=root.current;const selected=window.getSelection();
  if(!editor||!selected?.rangeCount||!selected.anchorNode||!editor.contains(selected.anchorNode))return;
  if(selected.anchorNode instanceof Element&&selected.anchorNode.closest('[data-question-id]'))return;
  const range=selected.getRangeAt(0);
  const top=closestLine(range.startContainer,editor);
  if(top?.dataset.questionId)return;
  savedRange.current=range.cloneRange();
 }
 useEffect(()=>{
  const handler=()=>remember();
  document.addEventListener('selectionchange',handler);
  return()=>document.removeEventListener('selectionchange',handler);
 },[]);
 function insertAtSelection(type:QuestionType){
  const editor=root.current;if(!editor||!editable)return;
  const selection=window.getSelection();
  const range=savedRange.current?.cloneRange()??(selection?.rangeCount?selection.getRangeAt(0).cloneRange():null);
  const direct=range?closestLine(range.startContainer,editor):null;
  const line=direct?.dataset.questionId?null:direct;
  const question=makeQuestion(type);
  if(type==='statement')question.label=placeholderLine;
  const questionElement=type==='statement'?makeLine():questionNode(question,pageRef.current.questions.filter(q=>q.type!=='statement').length);
  if(!line||line.dataset.role){
   const anchor=line?.dataset.role==='title'?editor.querySelector('[data-role="description"]'):line;
   if(anchor?.parentNode===editor)anchor.after(questionElement);
   else editor.appendChild(questionElement);
  }else if(range&&line.contains(range.startContainer)){
   const after=document.createRange();
   after.selectNodeContents(line);
   after.setStart(range.startContainer,range.startOffset);
   const trailing=after.extractContents();
   const tail=createEmptyParagraph();
   tail.appendChild(trailing);
   line.after(questionElement,tail);
   if(!line.textContent?.trim())line.remove();
  }else line.after(questionElement);
  if(type!=='statement')pageRef.current={...pageRef.current,questions:[...pageRef.current.questions,question]};
  ensureEnd();emit();
  const following=questionElement.nextElementSibling instanceof HTMLElement?questionElement.nextElementSibling:questionElement;
  setCaretAtStart(following);remember();
  setMenu(null);setFilter('');
 }
 useImperativeHandle(ref,()=>({insert:insertAtSelection,focus:()=>{
  const editor=root.current;if(!editor)return;
  const target=Array.from(editor.children).find(c=>c instanceof HTMLElement&&c.dataset.lineId) as HTMLElement|undefined;
  setCaretAtStart(target??editor);
 }}));
 function openInsertMenu(line?:HTMLElement){
  const editor=root.current;if(!editor)return;
  const container=editor.getBoundingClientRect();
  const rect=(line??editor).getBoundingClientRect();
  setMenu({top:Math.max(44,rect.top-container.top+Math.min(rect.height,32)+8),left:Math.max(0,Math.min(rect.left-container.left,container.width-280))});
  setFilter('');
  window.requestAnimationFrame(()=>menuInput.current?.focus());
 }
 function onKeyDown(event:KeyboardEvent<HTMLDivElement>){
  if(!editable)return;
  const editor=root.current;if(!editor)return;
  const range=window.getSelection()?.rangeCount?window.getSelection()!.getRangeAt(0):null;
  const line=range?closestLine(range.startContainer,editor):null;
  if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&line&&!line.dataset.questionId&&!line.dataset.role&&!line.textContent?.trim()){
   event.preventDefault();remember();openInsertMenu(line);return;
  }
  if(event.key==='Enter'&&line?.dataset.role==='title'){
   event.preventDefault();
   const next=editor.querySelector<HTMLElement>('[data-role="description"]');
   if(next)setCaretAtStart(next);
   return;
  }
  if(event.key==='Escape'&&menu){setMenu(null);}
 }
 function onInput(event:FormEvent<HTMLDivElement>){
  const from=event.target;
  if(from instanceof HTMLElement&&from.closest('[data-question-id]')){
   const question=closestQuestion(from);if(question?.dataset.questionId)onSelectRef.current(question.dataset.questionId);
  }
  ensureEnd();emit();
 }
 function updateQuestion(id:string,change:(q:StudioQuestion)=>StudioQuestion){
  const editor=root.current;if(!editor)return;
  const old=pageRef.current.questions.find(q=>q.id===id);if(!old)return;
  const updated=change(old);
  pageRef.current={...pageRef.current,questions:pageRef.current.questions.map(q=>q.id===id?updated:q)};
  const existing=Array.from(editor.children).find(n=>n instanceof HTMLElement&&n.dataset.questionId===id);
  if(existing)existing.replaceWith(questionNode(updated,pageRef.current.questions.filter(q=>q.type!=='statement').findIndex(q=>q.id===id)));
  emit();
 }
 function moveQuestion(id:string,delta:number){
  const editor=root.current;if(!editor)return;
  const nodes=Array.from(editor.children).filter((n):n is HTMLElement=>n instanceof HTMLElement&&!!n.dataset.questionId);
  const index=nodes.findIndex(n=>n.dataset.questionId===id),node=nodes[index],other=nodes[index+delta];
  if(!node||!other)return;
  if(delta<0)other.before(node);else other.after(node);
  emit();
 }
 function onClick(event:MouseEvent<HTMLDivElement>){
  const target=event.target;if(!(target instanceof Element))return;
  const block=closestQuestion(target),id=block?.dataset.questionId;
  if(!id)return;
  onSelectRef.current(id);
  const button=target.closest<HTMLButtonElement>('button[data-action]');
  if(!button)return;
  const command=button.dataset.action;
  if(command==='settings')onSettingsRef.current(id);
  if(command==='delete')onDeleteRef.current(id);
  if(command==='duplicate'){
   const original=pageRef.current.questions.find(q=>q.id===id);if(!original)return;
   const copy=duplicateQuestion(original);
   pageRef.current={...pageRef.current,questions:[...pageRef.current.questions,copy]};
   block?.after(questionNode(copy,0));ensureEnd();emit();
  }
  if(command==='move-up')moveQuestion(id,-1);
  if(command==='move-down')moveQuestion(id,1);
  if(command==='add-option'||command==='add-other'){
   updateQuestion(id,q=>{
    if(q.options.length>=100)return q;
    if(command==='add-other'&&q.options.some(o=>o.value===OTHER_VALUE))return q;
    const value=command==='add-other'?OTHER_VALUE:'option_'+crypto.randomUUID().slice(0,8);
    return {...q,options:[...q.options,{id:crypto.randomUUID(),value,label:command==='add-other'?'Autre':'Option '+(q.options.length+1)}]};
   });
  }
  if(command==='remove-option'&&button.dataset.optionId){
   updateQuestion(id,q=>q.options.length>2?{...q,options:q.options.filter(o=>o.id!==button.dataset.optionId)}:q);
  }
 }
 function format(name:'bold'|'italic'){
  const selection=window.getSelection();if(savedRange.current&&selection){selection.removeAllRanges();selection.addRange(savedRange.current);}
  root.current?.focus();
  if(typeof document.execCommand==='function')document.execCommand(name,false);
  remember();emit();
 }
 function onPaste(event:ClipboardEvent<HTMLDivElement>){
  if(closestQuestion(event.target))return;
  event.preventDefault();
  const plain=event.clipboardData.getData('text/plain');
  if(typeof document.execCommand==='function')document.execCommand('insertText',false,plain);
  else {
   const range=window.getSelection()?.getRangeAt(0);
   if(range){range.deleteContents();range.insertNode(document.createTextNode(plain));range.collapse(false);}
  }
  emit();
 }
 const available=questionTypes.filter(type=>type!=='statement'&&(questionTypeNames[type].toLowerCase().includes(filter.toLowerCase())||type.includes(filter.toLowerCase())));
 return <section className="relative mx-auto w-full max-w-[900px]" aria-label="Document du formulaire">
  {editable&&<div className="mb-7 flex flex-wrap items-center gap-2 border-b border-[#e7eee5] pb-4">
   <span className="mr-3 text-xs font-medium text-[#536c59]">Ton document</span>
   <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>format('bold')} aria-label="Mettre en gras" title="Gras (Ctrl+B)" className="flex h-9 w-9 items-center justify-center rounded-lg text-[#496c52] hover:bg-[#edf4ea]"><Bold size={18}/></button>
   <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>format('italic')} aria-label="Mettre en italique" title="Italique (Ctrl+I)" className="flex h-9 w-9 items-center justify-center rounded-lg text-[#496c52] hover:bg-[#edf4ea]"><Italic size={18}/></button>
   <div className="mx-1 h-5 w-px bg-[#dce6db]"/>
   <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>openInsertMenu()} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-[#2f6c43] hover:bg-[#edf4ea]"><Plus size={17}/> Insérer une question</button>
   <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-[#627967]"><Slash size={13}/> Tape / sur une ligne vide</span>
  </div>}
  <div ref={root} role="textbox" aria-label="Éditeur de document" aria-multiline="true"
   contentEditable={editable} suppressContentEditableWarning spellCheck
   onInput={onInput} onKeyDown={onKeyDown} onClick={onClick} onKeyUp={remember} onMouseUp={remember} onPaste={onPaste}
   className="min-h-[450px] w-full cursor-text space-y-1 pb-24 text-[#2c4535] outline-none [&_[data-empty='true']]:relative [&_[data-empty='true']]:before:pointer-events-none [&_[data-empty='true']]:before:text-[#8b9e90] [&_[data-empty='true']]:before:content-[attr(data-placeholder)] [&_p]:outline-none [&_h1]:outline-none [&_h2]:outline-none"/>
  {menu&&editable&&<div className="absolute z-50 w-[min(310px,calc(100vw-3rem))] rounded-2xl border border-[#d6e4d5] bg-white p-2 shadow-2xl"
    style={{top:menu.top+55,left:menu.left}} role="dialog" aria-label="Insérer dans le document">
    <input ref={menuInput} autoFocus type="search" value={filter} onChange={e=>setFilter(e.target.value)}
     onKeyDown={e=>{if(e.key==='Escape'){setMenu(null);root.current?.focus();}if(e.key==='Enter'&&available.length){e.preventDefault();insertAtSelection(available[0]);}}}
     placeholder="Rechercher une question…" aria-label="Rechercher un type de question"
     className="mb-2 h-11 w-full rounded-lg border border-[#d8e7d6] px-3 text-sm text-[#294b36] outline-none focus:border-[#6f9b79]"/>
    <div className="max-h-64 overflow-y-auto">{available.map(type=><button key={type} type="button" onMouseDown={e=>e.preventDefault()}
     onClick={()=>insertAtSelection(type)} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-[#365b40] hover:bg-[#eef6eb]"><Type size={15}/>{questionTypeNames[type]}</button>)}
     {!available.length&&<p className="p-3 text-sm text-[#607265]">Aucun type correspondant</p>}</div>
    <button type="button" onClick={()=>setMenu(null)} className="mt-1 w-full rounded-lg px-3 py-2 text-left text-xs text-[#637c68] hover:bg-[#f2f6f0]">Fermer</button>
   </div>}
 </section>;
});
