import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { DocumentCanvas } from '../src/components/studio/DocumentCanvas';
import { sanitizeDocumentHtml } from '../src/shared/richText';
import { makePage, makeQuestion } from '../src/shared/studio';

afterEach(()=>cleanup());
function setup(withText=true){
 const page=makePage();
 const paragraph=makeQuestion('statement');
 paragraph.label='Voici mon introduction.';
 const field=makeQuestion('short_text');field.label='Comment vous appelez-vous ?';
 page.questions=withText?[paragraph,field]:[];
 const onChange=vi.fn();
 render(<DocumentCanvas page={page} editable onChange={onChange}
  onSelectQuestion={vi.fn()} onOpenSettings={vi.fn()} onDeleteQuestion={vi.fn()}/>);
 const documentEditor=screen.getByRole('textbox',{name:'Éditeur de document'});
 return {page,onChange,documentEditor,field};
}
function cursor(node:Node,offset=0){
 const r=document.createRange();r.setStart(node,offset);r.collapse(true);
 const selected=window.getSelection()!;selected.removeAllRanges();selected.addRange(r);
}
describe('éditeur documentaire unique',()=>{
 it('contient une seule surface éditable, du texte libre et les questions dans le même document',()=>{
  const {documentEditor}=setup();
  expect(documentEditor).toHaveAttribute('contenteditable','true');
  expect(documentEditor.querySelectorAll('[contenteditable="true"]')).toHaveLength(0);
  expect(documentEditor.querySelectorAll('[data-line-id]')).toHaveLength(2); // paragraphe existant + ligne libre après la question
  expect(documentEditor.querySelectorAll('[data-question-id]')).toHaveLength(1);
  expect(within(documentEditor).getByText('Voici mon introduction.')).toBeInTheDocument();
  expect(documentEditor.querySelector('textarea')).toBeNull();
 });
 it('enregistre le texte saisi en maintenant les identifiants de question',()=>{
  const {documentEditor,onChange,field}=setup();
  const paragraph=documentEditor.querySelector<HTMLElement>('[data-line-id]')!;
  paragraph.textContent='Un autre paragraphe entièrement libre.';
  fireEvent.input(paragraph);
  const result=onChange.mock.lastCall![0];
  expect(result.questions[0].label).toBe('Un autre paragraphe entièrement libre.');
  expect(result.questions[1].id).toBe(field.id);
 });
 it('permet de taper une barre oblique dans le texte courant',()=>{
  const {documentEditor}=setup(false);
  const paragraph=documentEditor.querySelector<HTMLElement>('[data-line-id]')!;
  paragraph.textContent='La date est le 02';
  cursor(paragraph.firstChild!,paragraph.firstChild!.textContent!.length);
  fireEvent.keyDown(documentEditor,{key:'/'});
  expect(screen.queryByRole('dialog',{name:'Insérer dans le document'})).not.toBeInTheDocument();
 });
 it('insère une question depuis une ligne vide du même document',()=>{
  const {documentEditor,onChange}=setup(false);
  const paragraph=documentEditor.querySelector<HTMLElement>('[data-line-id]')!;
  cursor(paragraph,0);
  fireEvent.keyDown(documentEditor,{key:'/'});
  expect(screen.getByRole('dialog',{name:'Insérer dans le document'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Texte court'}));
  expect(documentEditor.querySelectorAll('[data-question-id]')).toHaveLength(1);
  expect(onChange.mock.lastCall![0].questions.some((q:{type:string})=>q.type==='short_text')).toBe(true);
  expect(documentEditor.querySelectorAll('[data-line-id]')).toHaveLength(1);
 });
 it('remplace les anciens paragraphes factices par une zone de rédaction vide',()=>{
  const page=makePage();
  const a=makeQuestion('statement'),b=makeQuestion('statement');
  a.label='Votre texte ici…';b.label='Votre texte ici…';page.questions=[a,b];
  render(<DocumentCanvas page={page} editable onChange={vi.fn()} onSelectQuestion={vi.fn()} onOpenSettings={vi.fn()} onDeleteQuestion={vi.fn()}/>);
  const doc=screen.getByRole('textbox',{name:'Éditeur de document'});
  expect(doc.querySelectorAll('[data-line-id]')).toHaveLength(1);
  expect(doc.textContent).not.toContain('Votre texte ici…');
 });
});
describe('sécurité de la mise en forme',()=>{
 it('supprime scripts, événements HTML et liens non sécurisés',()=>{
  const html=sanitizeDocumentHtml('<strong>Bonjour</strong><img src=x onerror=alert(1)><script>alert(1)</script><a href="javascript:alert(1)">mal</a><a href="https://example.com">ok</a>');
  expect(html).toContain('<strong>Bonjour</strong>');
  expect(html).not.toMatch(/script|onerror|javascript:|<img/i);
  expect(html).toContain('href="https://example.com"');
 });
});
