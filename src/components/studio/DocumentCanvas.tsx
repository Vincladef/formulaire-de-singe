import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { Bold, Heading2, ImagePlus, Italic, Quote, Strikethrough, Type, Underline, Undo2, Redo2 } from 'lucide-react';
import { ColorPalette } from './ColorPalette';
import { audioMode } from '../../shared/audio';
import { OTHER_VALUE } from '../../shared/publicForm';
import { allowedInlineImage, sanitizeDocumentHtml } from '../../shared/richText';
import { clipboardImageToDataUrl } from '../../shared/clipboardImage';
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
const textTypes = ['P','DIV','H2','BLOCKQUOTE'];

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
 line.dataset.empty=String(!line.textContent?.trim()&&!line.querySelector('img'));
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
 if(q.type==='select'){
  const preview=el('select','min-h-10 w-full max-w-xs rounded-lg border border-[#d8e5d9] bg-[#f8faf7] px-3 text-sm text-[#45634b]') as HTMLSelectElement;
  preview.setAttribute('aria-label','Aperçu de la liste déroulante');
  const empty=el('option','', 'Choisir une réponse…') as HTMLOptionElement;
  empty.value='';preview.append(empty);
  for(const item of q.options){const opt=el('option','',item.label) as HTMLOptionElement;opt.value=item.value;preview.append(opt);}
  answer.appendChild(preview);
 }
 if(['single_choice','multiple_choice','select'].includes(q.type)){
  const choices=q.type==='select'?el('details','mt-2 rounded-lg border border-[#e2ebe2] bg-[#fcfdfb] px-3 py-2'):answer;
  if(q.type==='select'){
   const summary=el('summary','cursor-pointer py-1 text-sm font-medium text-[#477153]','Modifier les choix');
   choices.appendChild(summary);
  }
  for(const [i,opt] of q.options.entries()){
   const row=el('div','flex min-h-9 items-center gap-2');
   if(q.type!=='select')row.appendChild(el('span','text-[#7f9b85]',q.type==='multiple_choice'?'☐':'◯'));
   const option=textField('option',opt.label,'Option '+(i+1),'min-h-9 min-w-0 flex-1 rounded-md bg-transparent px-1 text-sm text-[#44674e] outline-none focus:bg-[#f1f7ee]');
   option.dataset.optionId=opt.id;option.setAttribute('aria-label','Choix '+(i+1));
   row.appendChild(option);
   if(q.options.length>2&&opt.value!==OTHER_VALUE){const del=action('×','remove-option');del.dataset.optionId=opt.id;row.appendChild(del);}
   choices.appendChild(row);
  }
  const add=action('+ Ajouter un choix','add-option');add.className+=' mt-1';choices.appendChild(add);
  if(!q.options.some(o=>o.value===OTHER_VALUE))choices.appendChild(action('+ Autre','add-other'));
  if(q.type==='select')answer.appendChild(choices);
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
 const fileInput=useRef<HTMLInputElement>(null);
 const [textColor,setTextColor]=useState('#285a3d');
 const [highlightColor,setHighlightColor]=useState('#fff0a8');
 const [imageFeedback,setImageFeedback]=useState('');
 onChangeRef.current=onChange;onSelectRef.current=onSelectQuestion;
 onSettingsRef.current=onOpenSettings;onDeleteRef.current=onDeleteQuestion;

 const build=useCallback((data:StudioPageData)=>{
  const editor=root.current;if(!editor)return;
  const fragment=document.createDocumentFragment();
  const title=el('h1','mb-3 min-h-12 text-3xl font-bold tracking-tight text-[#294b36] sm:text-4xl',data.title==='Nouvelle page'?'':data.title);
  title.dataset.role='title';title.dataset.placeholder='Titre de la page (facultatif)';title.dataset.empty=String(!title.textContent?.trim());
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
  const usedIds=new Set<string>();
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
    const text=(child.textContent??'').trim();
    const hasImage=Array.from(child.querySelectorAll('img')).some(img=>allowedInlineImage(img.getAttribute('src')??''));
    const label=text||(hasImage?'Image intégrée':'');
    child.dataset.empty=String(!label);
    if(!label)continue;
    const original=map.get(child.dataset.lineId??'');
    const template=original?.type==='statement'?original:makeQuestion('statement');
    const textStyle=child.tagName==='H2'?'heading':child.tagName==='BLOCKQUOTE'?'quote':'paragraph';
    let id=child.dataset.lineId??crypto.randomUUID();
    if(usedIds.has(id))id=crypto.randomUUID();
    usedIds.add(id);child.dataset.lineId=id;
    questions.push({...template,id,type:'statement',label,
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
  if(type!=='statement'){
   pageRef.current={...pageRef.current,questions:[...pageRef.current.questions,question]};
   onSelectRef.current(question.id);
  }
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
 function onClick(event:MouseEvent<HTMLDivElement>){
  const target=event.target;if(!(target instanceof Element))return;
  const block=closestQuestion(target),id=block?.dataset.questionId;
  if(!id){onSelectRef.current('');return;}
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
 function styleLine(style:'paragraph'|'heading'|'quote'){
  const editor=root.current;if(!editor)return;
  const range=savedRange.current??(window.getSelection()?.rangeCount?window.getSelection()!.getRangeAt(0):null);
  const line=range?closestLine(range.startContainer,editor):null;
  if(!line||line.dataset.role||line.dataset.questionId)return;
  const previous=pageRef.current.questions.find(q=>q.id===line.dataset.lineId);
  const question={...(previous?.type==='statement'?previous:makeQuestion('statement')),
   id:line.dataset.lineId??crypto.randomUUID(),label:line.textContent?.trim()||placeholderLine,
   settings:{...(previous?.settings??{}),textStyle:style}};
  const replacement=makeLine(question);
  replacement.innerHTML=sanitizeDocumentHtml(line.innerHTML);
  replacement.dataset.empty=String(!replacement.textContent?.trim()&&!replacement.querySelector('img'));
  line.replaceWith(replacement);setCaretAtStart(replacement);remember();emit();
 }
 function format(name:string,value?:string){ 
  root.current?.focus();
  const selection=window.getSelection();if(savedRange.current&&selection){selection.removeAllRanges();selection.addRange(savedRange.current);}
  if(typeof document.execCommand==='function')document.execCommand(name,false,value);
  remember();emit();
 }
 function clipboardRange():Range|null{
  const selection=window.getSelection();
  const current=savedRange.current??(selection?.rangeCount?selection.getRangeAt(0):null);
  return current?.cloneRange()??null;
 }
 function pasteInlineImage(src:string,originalRange:Range|null){
  const editor=root.current;if(!editor)return;
  const target=originalRange?.startContainer??null;
  const line=target?closestLine(target,editor):null;
  if(line&&(line.dataset.questionId||line.dataset.role)){
   setImageFeedback('Clique dans un paragraphe pour y placer l’image.');return;
  }
  if(editor.querySelectorAll('img[src^="data:image/"]').length>=8){
   setImageFeedback('Limite de 8 images par page atteinte.');return;
  }
  const existing=Array.from(editor.querySelectorAll<HTMLImageElement>('img[src^="data:image/"]')).reduce((sum,img)=>sum+(img.getAttribute('src')?.length??0),0);
  if(existing+src.length>1100000){setImageFeedback('La page contient déjà trop d’images ; compressez-en une.');return;}
  const image=document.createElement('img');
  image.src=src;image.alt='Image du formulaire';
  image.className='my-3 max-w-full h-auto rounded-lg';
  if(line&&originalRange&&editor.contains(line)){
   originalRange.deleteContents();
   originalRange.insertNode(image);
   originalRange.setStartAfter(image);
   originalRange.collapse(true);
  }else{
   let paragraph=Array.from(editor.children).reverse().find(node=>node instanceof HTMLElement&&node.dataset.lineId) as HTMLElement|undefined;
   if(!paragraph){paragraph=createEmptyParagraph();editor.appendChild(paragraph);}
   paragraph.append(image);
  }
  const selection=window.getSelection();
  if(selection&&originalRange){selection.removeAllRanges();selection.addRange(originalRange);savedRange.current=originalRange.cloneRange();}
  ensureEnd();setImageFeedback('');emit();
 }
 async function pasteImageFile(file:File,range:Range|null){
  if(!editable)return;
  setImageFeedback('Insertion de l’image…');
  try{
   const url=await clipboardImageToDataUrl(file);
   pasteInlineImage(url,range);
  }catch(error){setImageFeedback(error instanceof Error?error.message:'Impossible de coller cette image.');}
 }
 function onPaste(event:ClipboardEvent<HTMLDivElement>){
  if(!editable||closestQuestion(event.target))return;
  event.preventDefault();
  const range=clipboardRange();
  const image=Array.from(event.clipboardData.items??[]).find(item=>item.kind==='file'&&item.type.startsWith('image/'))?.getAsFile()
   ??Array.from(event.clipboardData.files??[]).find(file=>file.type.startsWith('image/'));
  if(image){void pasteImageFile(image,range);return;}
  const html=event.clipboardData.getData('text/html');
  if(html){
   const template=document.createElement('template');template.innerHTML=html;
   const embedded=Array.from(template.content.querySelectorAll('img')).find(img=>allowedInlineImage(img.getAttribute('src')??''));
   if(embedded){pasteInlineImage(embedded.getAttribute('src')!,range);return;}
  }
  const plain=event.clipboardData.getData('text/plain');
  if(typeof document.execCommand==='function')document.execCommand('insertText',false,plain);
  else if(range){
   range.deleteContents();const node=document.createTextNode(plain);range.insertNode(node);
   range.setStartAfter(node);range.collapse(true);
  }
  emit();
 }
 const available=questionTypes.filter(type=>type!=='statement'&&(questionTypeNames[type].toLowerCase().includes(filter.toLowerCase())||type.includes(filter.toLowerCase())));
 return <section className="relative mx-auto w-full max-w-[900px]" aria-label="Document du formulaire">
  {editable&&<div role="toolbar" aria-label="Mise en forme" className="mb-6 flex flex-wrap items-center gap-1 border-b border-[#e7eee5] pb-3">
   <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>format('undo')} aria-label="Annuler" title="Annuler" className="flex h-10 w-10 items-center justify-center rounded-lg text-[#496c52] hover:bg-[#edf4ea]"><Undo2 size={17}/></button>
   <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>format('redo')} aria-label="Rétablir" title="Rétablir" className="flex h-10 w-10 items-center justify-center rounded-lg text-[#496c52] hover:bg-[#edf4ea]"><Redo2 size={17}/></button>
   <div className="mx-1 h-5 w-px bg-[#dce6db]"/>
   <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>format('bold')} aria-label="Gras" title="Gras (Ctrl+B)" className="flex h-10 w-10 items-center justify-center rounded-lg text-[#496c52] hover:bg-[#edf4ea]"><Bold size={18}/></button>
   <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>format('italic')} aria-label="Italique" title="Italique (Ctrl+I)" className="flex h-10 w-10 items-center justify-center rounded-lg text-[#496c52] hover:bg-[#edf4ea]"><Italic size={18}/></button>
   <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>format('underline')} aria-label="Souligner" title="Souligner" className="flex h-10 w-10 items-center justify-center rounded-lg text-[#496c52] hover:bg-[#edf4ea]"><Underline size={18}/></button>
   <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>format('strikeThrough')} aria-label="Barrer" title="Barrer" className="flex h-10 w-10 items-center justify-center rounded-lg text-[#496c52] hover:bg-[#edf4ea]"><Strikethrough size={18}/></button>
   <div className="mx-1 h-5 w-px bg-[#dce6db]"/>
   <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>styleLine('paragraph')} aria-label="Paragraphe" title="Paragraphe" className="flex h-10 w-10 items-center justify-center rounded-lg text-[#496c52] hover:bg-[#edf4ea]"><Type size={18}/></button>
   <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>styleLine('heading')} title="Titre" aria-label="Titre" className="flex h-10 w-10 items-center justify-center rounded-lg text-[#496c52] hover:bg-[#edf4ea]"><Heading2 size={18}/></button>
   <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>styleLine('quote')} title="Citation" aria-label="Citation" className="flex h-10 w-10 items-center justify-center rounded-lg text-[#496c52] hover:bg-[#edf4ea]"><Quote size={17}/></button>
   <div className="mx-1 h-5 w-px bg-[#dce6db]"/>
   <ColorPalette kind="text" label="Couleur du texte" value={textColor} onColor={color=>{setTextColor(color);format('foreColor',color);}}/>
   <ColorPalette kind="highlight" label="Couleur de surlignage" value={highlightColor} onColor={color=>{setHighlightColor(color);format('hiliteColor',color);}}/>
   <select aria-label="Taille des caractères" title="Taille des caractères" defaultValue="3" onChange={e=>format('fontSize',e.target.value)}
    className="h-10 w-[68px] rounded-lg border border-[#dce6db] bg-white px-1 text-sm text-[#41644a] outline-none">
    <option value="2">Petit</option><option value="3">16</option><option value="4">18</option><option value="5">24</option><option value="6">30</option>
   </select>
   <div className="mx-1 h-5 w-px bg-[#dce6db]"/>
   <button type="button" aria-label="Ajouter une image" title="Coller ou importer une image" onClick={()=>fileInput.current?.click()}
    className="flex h-10 w-10 items-center justify-center rounded-lg text-[#496c52] hover:bg-[#edf4ea]"><ImagePlus size={19}/></button>
   <input ref={fileInput} type="file" className="sr-only" tabIndex={-1} accept="image/png,image/jpeg,image/webp,image/gif"
    onChange={e=>{const file=e.target.files?.[0];const range=clipboardRange();if(file)void pasteImageFile(file,range);e.target.value='';}} aria-label="Choisir une image"/>
  </div>}
  {imageFeedback&&<p role="status" aria-live="polite" className="mb-3 text-sm text-[#6d5a36]">{imageFeedback}</p>}
  <div ref={root} role="textbox" aria-label="Éditeur de document" aria-multiline="true"
   contentEditable={editable} suppressContentEditableWarning spellCheck
   onInput={onInput} onKeyDown={onKeyDown} onClick={onClick} onKeyUp={remember} onMouseUp={remember} onPaste={onPaste}
   className="min-h-[450px] w-full cursor-text space-y-1 pb-24 text-[#2c4535] outline-none [&_img]:my-3 [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_[data-empty='true']]:relative [&_[data-empty='true']]:before:pointer-events-none [&_[data-empty='true']]:before:text-[#8b9e90] [&_[data-empty='true']]:before:content-[attr(data-placeholder)] [&_p]:outline-none [&_h1]:outline-none [&_h2]:outline-none"/>
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
