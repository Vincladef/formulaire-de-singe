import { fireEvent,render,screen } from '@testing-library/react';
import { describe,it,expect } from 'vitest';
import { StudioPreview } from './StudioPreview';
import { defaultFormTheme } from '../../shared/theme';
import type { StudioPageData } from '../../shared/studio';

const pages:StudioPageData[] = [{id:crypto.randomUUID(),title:'Première page',description:null,questions:[
 {id:crypto.randomUUID(),type:'short_text',label:'Première question',description:null,required:true,settings:{},options:[]},
 {id:crypto.randomUUID(),type:'short_text',label:'Deuxième question',description:null,required:false,settings:{},options:[]},
]}];
describe('Aperçu interactif',()=>{
 it('affiche une question à la fois et permet de revenir sans collecte',()=>{
  render(<StudioPreview pages={pages} theme={{...defaultFormTheme,layout:'questions'}}/>);
  expect(screen.getByText('Première question')).toBeInTheDocument();
  expect(screen.queryByText('Deuxième question')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/Continuer/}));
  expect(screen.getByText('Deuxième question')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/Retour/}));
  expect(screen.getByText('Première question')).toBeInTheDocument();
 });
});
