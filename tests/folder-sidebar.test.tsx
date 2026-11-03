import { afterEach,describe,expect,it,vi } from 'vitest';
import { cleanup,fireEvent,render,screen,within } from '@testing-library/react';
import { FolderSidebar } from '../src/components/studio/FolderSidebar';
afterEach(cleanup);
const folders=[{id:'research',name:'Recherche',createdAt:'2026-11-02T10:00:00Z'},{id:'events',name:'Événements',createdAt:'2026-11-02T10:00:00Z'}];
describe('bibliothèque de formulaires',()=>{
 it('sépare tous les formulaires, les non classés et les dossiers',()=>{
  const select=vi.fn();
  render(<FolderSidebar folders={folders} selected="all" allCount={4} formCounts={{uncategorized:2,research:1,events:1}}
   onSelect={select} onCreate={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()}/>);
  expect(screen.getByRole('complementary',{name:'Dossiers de formulaires'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:/Tous les formulaires/})).toHaveAttribute('aria-pressed','true');
  fireEvent.click(screen.getByRole('button',{name:/Recherche 1/}));
  expect(select).toHaveBeenCalledWith('research');
 });
 it('expose la création, le renommage et la suppression du dossier sans affecter un formulaire',()=>{
  const onCreate=vi.fn(),onRename=vi.fn(),onDelete=vi.fn();
  render(<FolderSidebar folders={folders} selected="research" allCount={3} formCounts={{uncategorized:1,research:2}}
   onSelect={vi.fn()} onCreate={onCreate} onRename={onRename} onDelete={onDelete}/>);
  fireEvent.click(screen.getByRole('button',{name:'Nouveau dossier'}));
  expect(onCreate).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByLabelText('Options du dossier Recherche'));
  fireEvent.click(within(screen.getByLabelText('Options du dossier Recherche').closest('details')!).getByRole('button',{name:'Renommer'}));
  expect(onRename).toHaveBeenCalledWith(folders[0]);
  fireEvent.click(screen.getByLabelText('Options du dossier Recherche'));
  fireEvent.click(within(screen.getByLabelText('Options du dossier Recherche').closest('details')!).getByRole('button',{name:'Supprimer'}));
  expect(onDelete).toHaveBeenCalledWith(folders[0]);
 }); it('déplie un dossier et accepte un formulaire glissé vers le sous-dossier',()=>{
  const onMoveForm=vi.fn();
  const nested=[
   {id:'research',name:'Recherche',createdAt:'2026-11-02T10:00:00Z',parentId:null},
   {id:'sub',name:'Psychologie',createdAt:'2026-11-02T10:00:00Z',parentId:'research'}
  ];
  render(<FolderSidebar folders={nested} selected="all" allCount={1} formCounts={{uncategorized:0,research:0,sub:1}}
   onSelect={vi.fn()} onCreate={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()}
   onMoveForm={onMoveForm}/>);
  fireEvent.click(screen.getByRole('button',{name:'Déplier Recherche'}));
  const target=screen.getByRole('button',{name:/Psychologie 1/}).closest('.group');
  expect(target).not.toBeNull();
  const dataTransfer={getData:(type:string)=>type==='application/x-monk-form'?'form-id':''};
  fireEvent.dragOver(target!,{dataTransfer});
  fireEvent.drop(target!,{dataTransfer});
  expect(onMoveForm).toHaveBeenCalledWith('form-id','sub');
 });

});
