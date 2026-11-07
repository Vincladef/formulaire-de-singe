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
  expect(screen.getAllByRole('link',{name:/Voir le programme et réserver/i})).toHaveLength(2);
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


describe('Sorties conditionnelles par événement',()=>{
 it('montre les photos et prix puis configure uniquement les activités choisies',async()=>{
  const events=['E26-001','E26-002','E26-003'];
  const titles=['Festival insolite','Concert gratuit','Exposition curieuse'];
  const galleryId=crypto.randomUUID();
  const cond=(code:string)=>({visibility:{action:'show' as const,match:'all' as const,
    conditions:[{sourceKey:'gallery-key',operator:'contains' as const,value:code}]}});
  const base={id:crypto.randomUUID(),type:'multiple_choice' as const,label:'Quelles sorties te tentent ?',
    description:null,required:false,settings:{logicId:'gallery-key',choiceCards:Object.fromEntries(events.map((code,index)=>[
      code,{imageSrc:'data:image/jpeg;base64,AA==',price:'Gratuit',priceNote:'Sur inscription',
      date:'Samedi',venue:'Paris',summary:'Une activité intéressante et documentée.',url:'https://www.paris.fr/evenements/exemple-'+index}])),
    },options:events.map((code,index)=>({value:code,label:titles[index]}))};
  const followUps=events.flatMap((code,index)=>[
    {id:crypto.randomUUID(),type:'single_choice' as const,label:'Quel format pour '+titles[index]+' ?',
      description:null,required:false,settings:{logicId:code+'-format',logic:{visibility:cond(code).visibility,
        requiredWhen:{match:'all' as const,conditions:[{sourceKey:'gallery-key',operator:'contains' as const,value:code}]}}},
      options:[{value:'duo',label:'En duo'},{value:'groupe',label:'En groupe'}]},
    {id:crypto.randomUUID(),type:'multiple_choice' as const,label:'Quels cercles pour '+titles[index]+' ?',
      description:null,required:false,settings:{logicId:code+'-circles',logic:cond(code)},
      options:[{value:'proches',label:'Proches'},{value:'amis',label:'Amis'}]},
  ]);
  const conditional:PublicForm={...form,pages:[
    {id:'gallery',title:'Choix des sorties',description:null,questions:[{...base,id:galleryId}]},
    {id:'people',title:'Avec qui ?',description:null,questions:followUps},
  ]};
  fetchMock.mockImplementation(async (_path:string,opts?:RequestInit)=>({ok:true,status:opts?.method==='POST'?201:200,
    json:async()=>opts?.method==='POST'?{ok:true,data:{id:'ok'}}:{ok:true,data:conditional}}));
  renderForm();await screen.findByText('Festival insolite');
  expect(screen.getAllByText('Gratuit')).toHaveLength(3);
  expect(screen.getAllByText('Sur inscription')).toHaveLength(3);
  expect(screen.getAllByRole('img',{name:/Illustration de/})).toHaveLength(3);
  fireEvent.click(screen.getByRole('checkbox',{name:'Choisir Festival insolite'}));
  fireEvent.click(screen.getByRole('checkbox',{name:'Choisir Exposition curieuse'}));
  expect(screen.getByText('2 sorties retenues')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/Configurer mes sorties/i}));
  expect(await screen.findByText('Avec qui ?')).toBeInTheDocument();
  expect(screen.getByRole('group',{name:'Quel format pour Festival insolite ?'})).toBeInTheDocument();
  expect(screen.queryByRole('group',{name:'Quel format pour Concert gratuit ?'})).not.toBeInTheDocument();
  expect(screen.getByRole('group',{name:'Quel format pour Exposition curieuse ?'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/Envoyer mes réponses/i}));
  expect(screen.getAllByText('Cette réponse est obligatoire.')).toHaveLength(2);
  fireEvent.click(within(screen.getByRole('group',{name:'Quel format pour Festival insolite ?'})).getByLabelText('En duo'));
  fireEvent.click(within(screen.getByRole('group',{name:'Quel format pour Exposition curieuse ?'})).getByLabelText('En groupe'));
  fireEvent.click(screen.getByRole('button',{name:/Envoyer mes réponses/i}));
  await waitFor(()=>expect(screen.getByText(/Merci pour votre participation/i)).toBeInTheDocument());
  const request=fetchMock.mock.calls.find((call:unknown[])=>(call[1] as RequestInit|undefined)?.method==='POST');
  const submitted=JSON.parse((request![1] as RequestInit).body as string);
  expect(submitted.answers.map((entry:{questionId:string})=>entry.questionId)).toEqual([
    galleryId,followUps[0].id,followUps[4].id,
  ]);
 });
});
