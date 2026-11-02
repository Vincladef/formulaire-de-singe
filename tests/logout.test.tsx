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
  it('propose Se connecter et non Ouvrir le Studio dans l’en-tête public',()=>{
    useSession.mockReturnValue({isPending:false,data:null});
    renderHeader();
    expect(screen.getByRole('link',{name:/se connecter/i})).toHaveAttribute('href','/connexion');
    expect(screen.queryByText('Ouvrir le Studio')).not.toBeInTheDocument();
  });
  it('propose la déconnexion lorsque la session est active', () => {
    renderHeader();
    fireEvent.click(screen.getByLabelText('Menu du compte'));
    expect(screen.getByRole('button', { name: /se déconnecter/i })).toBeInTheDocument();
  });
  it('ferme le menu du compte lorsqu’on clique à l’extérieur', () => {
    renderHeader();
    fireEvent.click(screen.getByLabelText('Menu du compte'));
    expect(screen.getByRole('button', { name: /se déconnecter/i })).toBeVisible();
    fireEvent.pointerDown(document.body);
    expect(screen.getByLabelText('Menu du compte').closest('details')).not.toHaveAttribute('open');
  });
  it('ferme le menu du compte avec Échap et rend le focus au bouton', () => {
    renderHeader();
    const trigger = screen.getByLabelText('Menu du compte');
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(trigger.closest('details')).not.toHaveAttribute('open');
    expect(trigger).toHaveFocus();
  });
  it('aligne le logo et le compte sur la largeur du Studio', () => {
    const { container } = renderHeader();
    expect(container.querySelector('header > div')).toHaveClass('max-w-[1550px]');
    expect(screen.getByText('Mon compte')).toBeInTheDocument();
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
