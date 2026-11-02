import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ColorPalette, presetColors } from '../src/components/studio/ColorPalette';
afterEach(cleanup);
describe('palette façon Google Docs',()=>{
 it('montre une grille de petits carrés prédéfinis plutôt que le sélecteur natif immédiatement',()=>{
  const onColor=vi.fn();
  render(<ColorPalette kind="text" label="Couleur du texte" value="#285a3d" onColor={onColor}/>);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Couleur du texte'}));
  const palette=screen.getByRole('dialog',{name:'Couleur du texte'});
  expect(palette).toBeInTheDocument();
  expect(presetColors.length).toBeGreaterThanOrEqual(60);
  fireEvent.click(screen.getByRole('button',{name:'Choisir #ff0000'}));
  expect(onColor).toHaveBeenCalledWith('#ff0000');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 });
 it('permet un choix personnalisé sans perdre les couleurs prédéfinies',()=>{
  const onColor=vi.fn();
  render(<ColorPalette kind="highlight" label="Couleur de surlignage" value="#fff0a8" onColor={onColor}/>);
  fireEvent.click(screen.getByRole('button',{name:'Couleur de surlignage'}));
  fireEvent.change(screen.getByLabelText('Couleur personnalisée, couleur de surlignage'),{target:{value:'#123abc'}});
  expect(onColor).toHaveBeenCalledWith('#123abc');
 });
 it('ferme la palette en cliquant ailleurs',()=>{
  render(<ColorPalette kind="text" label="Couleur du texte" value="#285a3d" onColor={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Couleur du texte'}));
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 });
});
