import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from './HomePage';

function setup() { render(<MemoryRouter><HomePage /></MemoryRouter>); }

describe('Accueil', () => {
  it('présente le projet et un lien vers le Studio', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Des formulaires');
    expect(screen.getByRole('link', { name: /Découvrir le Studio/i })).toHaveAttribute('href', '/studio');
  });
  it('permet de répondre à la question de démonstration sans transmission', () => {
    setup();
    fireEvent.click(screen.getByLabelText('Gérer mon budget'));
    expect(screen.getByLabelText('Gérer mon budget')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: /Valider/i }));
    expect(screen.getByText('Merci pour la réponse !')).toBeInTheDocument();
    expect(screen.getByText(/Rien n'a été envoyé ni enregistré/)).toBeInTheDocument();
  });
});
