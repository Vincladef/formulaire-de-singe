import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { StudioPage } from './StudioPage';
import { getAccessToken } from '../authClient';
vi.mock('../authClient',()=>({getAccessToken:vi.fn().mockResolvedValue(null)}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(getAccessToken).mockReset();
  vi.mocked(getAccessToken).mockResolvedValue(null);
});
describe('Studio',()=>{
  it('affiche la liste et un message d’erreur si la session API manque',async()=>{
    render(<MemoryRouter><StudioPage/></MemoryRouter>);
    expect(screen.getByRole('heading',{name:/Mes formulaires/i})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Nouveau formulaire/i})).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Impossible de récupérer le jeton de connexion/);
  });
  it('intègre titres et introductions dans le document libre, avec pages toujours accessibles',async()=>{
    vi.mocked(getAccessToken).mockResolvedValue('test-jwt');
    const id='d8ee0d8b-9d43-4609-8865-fd9b090c7fe9';
    const summary={id,title:'Vos courses alimentaires',slug:'courses-alimentaires',role:'owner',
      createdAt:'2026-11-02T10:00:00.000Z',updatedAt:'2026-11-02T10:00:00.000Z',archivedAt:null,published:false};
    const form={...summary,description:'Texte de présentation existant',versions:[{
      id:'0b447a9b-80a6-4c1d-92a5-cf248fb97723',number:1,status:'draft',
      publishedAt:null,revision:0,rules:[],pages:[
        {id:'c54df471-6a38-42b8-b279-1e9667f963bc',position:0,title:'Pour commencer',description:'Environ 5 minutes.',questions:[]},
        {id:'183c502d-7944-4406-8919-2bc3a915cece',position:1,title:'Vos habitudes',description:null,questions:[]},
      ]
    }]};
    const fetchMock=vi.fn(async(input:string)=>({
      json:async()=>({ok:true,data:
       input.endsWith('/draft')?{revision:1}:
       input.includes('/api/folders')?[]:
       input.endsWith('/api/forms/'+id)?form:[summary]})
    }));
    vi.stubGlobal('fetch',fetchMock);
    render(<MemoryRouter><StudioPage/></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button',{name:/Vos courses alimentaires/i}));
    const nav=await screen.findByRole('tablist',{name:'Pages du formulaire'});
    expect(within(nav).getAllByRole('tab')).toHaveLength(2);
    expect(within(nav).getByRole('tab',{name:/Page 1 Pour commencer/i})).toHaveAttribute('aria-selected','true');
    const document=screen.getByRole('textbox',{name:'Éditeur de document'});
    expect(document.querySelector('[data-role="title"]')).toBeNull();
    expect(screen.queryByRole('textbox',{name:'Introduction du formulaire'})).not.toBeInTheDocument();
    expect(within(document).getByRole('heading',{name:'Vos courses alimentaires'})).toBeInTheDocument();
    expect(within(document).getByText('Texte de présentation existant')).toBeInTheDocument();
    expect(within(document).getByRole('heading',{name:'Pour commencer'})).toBeInTheDocument();
    expect(within(document).getByText('Environ 5 minutes.')).toBeInTheDocument();
    await waitFor(()=>expect(fetchMock.mock.calls.some(call=>String(call[0]).endsWith('/draft'))).toBe(true));
    fireEvent.click(within(nav).getByRole('tab',{name:/Page 2 Vos habitudes/i}));
    expect(screen.queryByRole('heading',{name:'Pour commencer'})).not.toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'Vos habitudes'})).toBeInTheDocument();
    fireEvent.click(within(nav).getByRole('tab',{name:/Page 1 Pour commencer/i}));
    expect(screen.getByRole('heading',{name:'Pour commencer'})).toBeInTheDocument();
  });
  it('rend visible l’onglet Intégrations et son action Google Sheets',async()=>{
    vi.mocked(getAccessToken).mockResolvedValue('test-jwt');
    const formId='d8ee0d8b-9d43-4609-8865-fd9b090c7fe9';
    const summary={id:formId,title:'Mon nouveau formulaire',slug:'nouveau',role:'owner',
      createdAt:'2026-11-02T10:00:00.000Z',updatedAt:'2026-11-02T10:00:00.000Z',archivedAt:null,published:false};
    const form={...summary,description:null,versions:[{
      id:'0b447a9b-80a6-4c1d-92a5-cf248fb97723',number:1,status:'draft',
      publishedAt:null,revision:0,rules:[],pages:[{
        id:'c54df471-6a38-42b8-b279-1e9667f963bc',position:0,title:'Nouvelle page',description:null,questions:[]
      }]
    }]};
    vi.stubGlobal('fetch',vi.fn(async(input:string)=>({
      json:async()=>({ok:true,data:input.includes('/api/integrations/google/')?
       {configured:false,connected:false,spreadsheetUrl:null,lastSyncedAt:null,lastError:null,pending:0}:
       input.includes('/api/forms/')?form:[summary]})
    })));
    render(<MemoryRouter><StudioPage/></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button',{name:/Mon nouveau formulaire/i}));
    const sections=await screen.findByRole('navigation',{name:'Sections du formulaire'});
    expect(within(sections).getAllByRole('button').map(b=>b.textContent?.trim()))
      .toEqual(['Éditeur','Résultats','Intégrations','Paramètres']);
    fireEvent.click(within(sections).getByRole('button',{name:'Intégrations'}));
    expect(await screen.findByRole('region',{name:'Synchronisation Google Sheets'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Connecter Google Sheets/i})).toBeDisabled();
    expect(screen.getByText(/Connexion Google à activer/i)).toBeInTheDocument();
  });
});
