import { fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { MemoryRouter,Route,Routes } from 'react-router-dom';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { PublicFormPage } from './PublicFormPage';
import type { PublicForm } from '../shared/publicForm';
const form:PublicForm={id:'form',title:'Mon enquête',slug:'demo',description:'Bonjour',versionId:crypto.randomUUID(),versionNumber:1,requireConsent:false,pages:[
{id:'p1',title:'Première page',description:null,questions:[{id:crypto.randomUUID(),type:'short_text',label:'Votre couleur ?',description:null,required:true,options:[]}]},
{id:'p2',title:'Deuxième page',description:null,questions:[{id:crypto.randomUUID(),type:'single_choice',label:'Votre choix ?',description:null,required:true,options:[{value:'a',label:'Oui'},{value:'b',label:'Non'}]}]},
]};
const fetchMock=vi.fn();
beforeEach(()=>{vi.restoreAllMocks();fetchMock.mockReset();vi.stubGlobal('fetch',fetchMock);
 fetchMock.mockImplementation(async (_path:string,opts?:RequestInit)=>({ok:true,status:opts?.method==='POST'?201:200,json:async()=>opts?.method==='POST'?{ok:true,data:{id:'ok'}}:{ok:true,data:form}}));
 vi.stubGlobal('scrollTo',vi.fn());});
const renderForm=()=>render(<MemoryRouter initialEntries={['/f/demo']}><Routes><Route path="/f/:slug" element={<PublicFormPage/>}/></Routes></MemoryRouter>);
describe('Parcours répondant',()=>{
 it('préserve la saisie lorsqu’on revient en arrière et refuse une réponse absente',async()=>{
  renderForm();expect(await screen.findByText('Mon enquête')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/continuer/i}));
  expect(screen.getByRole('alert')).toHaveTextContent(/obligatoire/i);
  fireEvent.change(screen.getByLabelText(/Votre couleur/i),{target:{value:'Vert'}});
  fireEvent.click(screen.getByRole('button',{name:/continuer/i}));
  expect(await screen.findByText('Deuxième page')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/retour/i}));
  expect((screen.getByLabelText(/Votre couleur/i) as HTMLInputElement).value).toBe('Vert');
 });
 it('envoie une seule fois sans case de consentement',async()=>{
  renderForm();await screen.findByText('Mon enquête');
  fireEvent.change(screen.getByLabelText(/Votre couleur/i),{target:{value:'Vert'}});
  fireEvent.click(screen.getByRole('button',{name:/continuer/i}));
  fireEvent.click(within(screen.getByRole('group',{name:/Votre choix/i})).getByLabelText('Oui'));
  expect(screen.queryByLabelText(/J’accepte de participer/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/Envoyer mes réponses/i}));
  await waitFor(()=>expect(screen.getByText(/Merci pour votre participation/i)).toBeInTheDocument());
  expect(fetchMock.mock.calls.filter((c:unknown[])=>(c[1] as RequestInit|undefined)?.method==='POST')).toHaveLength(1);
 });
});


describe('Sélection rapide avec cartes illustrées',()=>{
 it('affiche les visuels et permet de cocher directement les sorties',async()=>{
  const optionId=crypto.randomUUID();
  const original=structuredClone(form);
  original.pages=[{id:'gallery',title:'Mes sorties',description:null,questions:[{
   id:optionId,type:'multiple_choice',label:'Quelles sorties te tentent ?',description:null,required:false,
   settings:{choiceCards:{
    'E26-001':{imageSrc:'data:image/jpeg;base64,AA==',date:'Dimanche',venue:'Paris 19e',summary:'Entrée gratuite',url:'https://www.paris.fr/evenements/exemple'},
    'E26-002':{imageSrc:'data:image/jpeg;base64,AA==',date:'Lundi',venue:'Paris 11e',url:'https://www.paris.fr/evenements/autre'},
   }},
   options:[{value:'E26-001',label:'Festival insolite'},{value:'E26-002',label:'Concert gratuit'}],
  }]}];
  fetchMock.mockImplementation(async (_path:string,opts?:RequestInit)=>({ok:true,status:opts?.method==='POST'?201:200,
   json:async()=>opts?.method==='POST'?{ok:true,data:{id:'ok'}}:{ok:true,data:original}}));
  renderForm();
  await screen.findByText('Festival insolite');
  expect(screen.getByRole('img',{name:'Illustration de Festival insolite'})).toHaveAttribute('src','data:image/jpeg;base64,AA==');
  expect(screen.getAllByRole('link',{name:/Détails et réservations/i})).toHaveLength(2);
  const choice=screen.getByRole('checkbox',{name:'Choisir Festival insolite'});
  expect(choice).not.toBeChecked();
  fireEvent.click(choice);
  expect(choice).toBeChecked();
  expect(screen.getByRole('checkbox',{name:'Choisir Concert gratuit'})).not.toBeChecked();
  fireEvent.click(screen.getByRole('button',{name:/Envoyer mes réponses/}));
  await waitFor(()=>expect(screen.getByText(/Merci pour votre participation/)).toBeInTheDocument());
  const request=fetchMock.mock.calls.find((call:unknown[])=>(call[1] as RequestInit|undefined)?.method==='POST');
  expect(request).toBeDefined();
  const body=JSON.parse((request![1] as RequestInit).body as string);
  expect(body.answers).toEqual([{questionId:optionId,value:['E26-001']}]);
 });
});
