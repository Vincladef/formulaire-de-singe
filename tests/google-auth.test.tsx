import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { socialSignIn } = vi.hoisted(() => ({
  socialSignIn: vi.fn(),
}));

vi.mock('../src/authClient', () => ({
  authClient: {
    signIn: { social: socialSignIn, email: vi.fn() },
    signUp: { email: vi.fn() },
  },
}));

import { AuthPage } from '../src/pages/AuthPage';

describe('Connexion avec Google', () => {
  beforeEach(() => {
    socialSignIn.mockReset();
    socialSignIn.mockResolvedValue({ data: { redirect: true }, error: null });
  });
  afterEach(() => { cleanup(); });

  it('affiche Google ET la connexion classique', () => {
    render(<MemoryRouter><AuthPage /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /continuer avec google/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/adresse e-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mot de passe/i)).toBeInTheDocument();
  });

  it('demande le flux OAuth Neon Auth Google avec retour au Studio', async () => {
    render(<MemoryRouter><AuthPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /continuer avec google/i }));
    await waitFor(() => expect(socialSignIn).toHaveBeenCalledTimes(1));
    expect(socialSignIn).toHaveBeenCalledWith({
      provider: 'google',
      callbackURL: `${window.location.origin}/studio`,
    });
  });

  it('affiche une erreur accessible si Google refuse la connexion', async () => {
    socialSignIn.mockResolvedValue({ data: null, error: { message: 'Connexion annulée' } });
    render(<MemoryRouter><AuthPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /continuer avec google/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connexion annulée');
  });
});
