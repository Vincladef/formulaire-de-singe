import { fireEvent, render, screen, within } from '@testing-library/react';
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
