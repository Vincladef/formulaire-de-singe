import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { StudioPage } from './StudioPage';
vi.mock('../authClient',()=>({getAccessToken:vi.fn().mockResolvedValue(null)}));
describe('Studio',()=>{
  it('affiche la liste et un message d’erreur si la session API manque',async()=>{
    render(<MemoryRouter><StudioPage/></MemoryRouter>);
    expect(screen.getByRole('heading',{name:/Le Studio/i})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Nouveau formulaire/i})).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Impossible de récupérer le jeton de connexion/);
  });
});
