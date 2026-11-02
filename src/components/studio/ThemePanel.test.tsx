import { fireEvent,render,screen } from '@testing-library/react';
import { describe,it,expect,vi } from 'vitest';
import { ThemePanel } from './ThemePanel';
import { defaultFormTheme } from '../../shared/theme';

describe('Personnalisation',()=>{
 it('rend toutes les options accessibles au clavier et prévient le Studio des changements',()=>{
  const onChange=vi.fn();
  render(<ThemePanel theme={defaultFormTheme} onChange={onChange}/>);
  fireEvent.click(screen.getByRole('button',{name:'Prune'}));
  expect(onChange).toHaveBeenCalledWith({...defaultFormTheme,accent:'plum'});
  fireEvent.click(screen.getByRole('button',{name:'Une question à la fois'}));
  expect(onChange).toHaveBeenCalledWith({...defaultFormTheme,layout:'questions'});
 });
 it('désactive les changements pour un utilisateur en lecture seule',()=>{
  render(<ThemePanel theme={defaultFormTheme} onChange={vi.fn()} disabled/>);
  expect(screen.getByRole('button',{name:'Prune'})).toBeDisabled();
 });
});
