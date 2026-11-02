import { fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { MemoryRouter,Route,Routes } from 'react-router-dom';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { PublicFormPage } from './PublicFormPage';
import type { PublicForm } from '../shared/publicForm';
const form:PublicForm={id:'form',title:'Mon enquête',slug:'demo',description:'Bonjour',versionId:crypto.randomUUID(),versionNumber:1,requireConsent:true,pages:[
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
 it('n’envoie aucune réponse lors du refus de consentement',async()=>{
  renderForm();await screen.findByText('Mon enquête');
  fireEvent.change(screen.getByLabelText(/Votre couleur/i),{target:{value:'Vert'}});
  fireEvent.click(screen.getByRole('button',{name:/continuer/i}));
  fireEvent.click(within(screen.getByRole('group',{name:/Votre choix/i})).getByLabelText('Oui'));
  fireEvent.click(screen.getByRole('button',{name:/Je ne souhaite pas participer/i}));
  expect(screen.getByText('Choix respecté')).toBeInTheDocument();
  expect(fetchMock.mock.calls.filter((c:unknown[])=>(c[1] as RequestInit|undefined)?.method==='POST')).toHaveLength(0);
 });
 it('envoie une seule fois après consentement',async()=>{
  renderForm();await screen.findByText('Mon enquête');
  fireEvent.change(screen.getByLabelText(/Votre couleur/i),{target:{value:'Vert'}});
  fireEvent.click(screen.getByRole('button',{name:/continuer/i}));
  fireEvent.click(within(screen.getByRole('group',{name:/Votre choix/i})).getByLabelText('Oui'));
  fireEvent.click(screen.getByLabelText(/J’accepte de participer/i));
  fireEvent.click(screen.getByRole('button',{name:/Envoyer mes réponses/i}));
  await waitFor(()=>expect(screen.getByText(/Merci pour votre participation/i)).toBeInTheDocument());
  expect(fetchMock.mock.calls.filter((c:unknown[])=>(c[1] as RequestInit|undefined)?.method==='POST')).toHaveLength(1);
 });
});
