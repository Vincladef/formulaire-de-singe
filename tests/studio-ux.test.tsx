import { afterEach,describe,expect,it,vi } from 'vitest';
import { cleanup,fireEvent,render,screen } from '@testing-library/react';
import { useState } from 'react';
import { QuestionCard } from '../src/components/studio/QuestionCard';
import { audioLimits,MAX_AUDIO_SECONDS } from '../src/shared/audio';
import { makeQuestion } from '../src/shared/studio';

afterEach(()=>cleanup());
function EditableCard(){
 const [question,setQuestion]=useState(()=>makeQuestion('short_text'));
 return <QuestionCard question={question} index={0} selected={true} onSelect={()=>{}}
  onUpdate={setQuestion} onMove={()=>{}} onDuplicate={()=>{}} onDelete={()=>{}} onDrop={()=>{}}/>;
}
describe('Édition directe du Studio',()=>{
 it('permet de changer le titre dans la carte sans ouvrir les réglages',()=>{
  render(<EditableCard/>);
  const field=screen.getByRole('textbox',{name:'Intitulé de la question 1'});
  fireEvent.change(field,{target:{value:'Quelle est votre expérience ?'}});
  fireEvent.blur(field);
  expect(screen.getByDisplayValue('Quelle est votre expérience ?')).toBeInTheDocument();
 });
 it('permet de changer la description directement',()=>{
  render(<EditableCard/>);
  const field=screen.getByRole('textbox',{name:'Description de la question 1'});
  fireEvent.change(field,{target:{value:'Quelques mots suffisent.'}});
  fireEvent.blur(field);
  expect(screen.getByDisplayValue('Quelques mots suffisent.')).toBeInTheDocument();
 });
 it('ne rend plus la carte entièrement déplaçable',()=>{
  render(<EditableCard/>);
  expect(screen.getByTestId(/question-/)).not.toHaveAttribute('draggable','true');
  expect(screen.getByTitle('Déplacer la question')).toHaveAttribute('draggable','true');
 });
 it('maintient la prévisualisation en lecture seule',()=>{
  const question=makeQuestion('audio');
  const change=vi.fn();
  render(<QuestionCard question={question} index={0} selected={false} onSelect={change}
   onMove={change} onDuplicate={change} onDelete={change} onDrop={change} readOnly/>);
  expect(screen.queryByRole('textbox',{name:/Intitulé de la question/})).not.toBeInTheDocument();
  expect(screen.getByText(question.label)).toBeInTheDocument();
 });
});
describe('Durées audio',()=>{
 it('propose dix minutes par défaut et trente au maximum',()=>{
  expect(audioLimits().maxSeconds).toBe(600);
  expect(MAX_AUDIO_SECONDS).toBe(1800);
  expect(audioLimits({maxAudioSeconds:1800}).maxSeconds).toBe(1800);
  expect(audioLimits({maxAudioSeconds:9999}).maxSeconds).toBe(1800);
 });
});
