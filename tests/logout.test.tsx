import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const { useSession, signOut } = vi.hoisted(() => ({ useSession: vi.fn(), signOut: vi.fn() }));
vi.mock('../src/authClient', () => ({ authClient: { useSession, signOut } }));
import { SiteHeader } from '../src/components/SiteHeader';

function renderHeader() {
  return render(
    <MemoryRouter initialEntries={['/studio']}>
      <Routes>
        <Route path="/studio" element={<SiteHeader/>}/>
        <Route path="/" element={<h1>Page d’accueil</h1>}/>
      </Routes>
    </MemoryRouter>,
  );
}
describe('Déconnexion du Studio', () => {
  beforeEach(() => {
    useSession.mockReturnValue({ isPending: false, data: { user: { id: 'personne-test' } } });
    signOut.mockResolvedValue({ data: {}, error: null });
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });
  it('propose la déconnexion lorsque la session est active', () => {
    renderHeader();
    fireEvent.click(screen.getByLabelText('Menu du compte'));
    expect(screen.getByRole('button', { name: /se déconnecter/i })).toBeInTheDocument();
  });
  it('appelle Neon Auth puis ramène à l’accueil', async () => {
    renderHeader();
    fireEvent.click(screen.getByLabelText('Menu du compte'));
    fireEvent.click(screen.getByRole('button', { name: /se déconnecter/i }));
    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    expect(await screen.findByRole('heading', { name: 'Page d’accueil' })).toBeInTheDocument();
  });
  it('garde une issue visible lorsque la déconnexion échoue', async () => {
    signOut.mockResolvedValue({ data: null, error: { message: 'Network' } });
    renderHeader();
    fireEvent.click(screen.getByLabelText('Menu du compte'));
    fireEvent.click(screen.getByRole('button', { name: /se déconnecter/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Déconnexion impossible');
  });
});
