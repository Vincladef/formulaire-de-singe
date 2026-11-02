import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { AudioRecorder,chooseRecorderMime } from './AudioRecorder';

class FakeRecorder {
 static isTypeSupported=(mime:string)=>mime.startsWith('audio/webm');
 state:'recording'|'inactive'='inactive';mimeType='audio/webm';
 ondataavailable:((event:{data:Blob})=>void)|null=null;
 onstop:(()=>void)|null=null;
 onerror:(()=>void)|null=null;
 constructor(_stream:MediaStream,_options?:MediaRecorderOptions){}
 start(){this.state='recording';}
 stop(){this.state='inactive';this.ondataavailable?.({data:new Blob([new Uint8Array([0x1a,0x45,0xdf,0xa3,1,2])],{type:'audio/webm'})});this.onstop?.();}
}
const stopTrack=vi.fn();
beforeEach(()=>{
 vi.stubGlobal('MediaRecorder',FakeRecorder);
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:vi.fn(async()=>({getTracks:()=>[{stop:stopTrack,addEventListener:vi.fn()}]}))}});
 Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=>'blob:fake-audio')});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()});
 stopTrack.mockReset();
});
afterEach(()=>vi.unstubAllGlobals());

describe('Enregistrement vocal',()=>{
 it('sélectionne le format pris en charge, sans supposer que Safari utilise WebM',()=>{
  expect(chooseRecorderMime(m=>m==='audio/mp4')).toBe('audio/mp4');
  expect(chooseRecorderMime(()=>false)).toBe('');
 });
 it('capture, arrête, permet la réécoute et efface la réponse',async()=>{
  const onChange=vi.fn();render(<AudioRecorder onChange={onChange}/>);
  fireEvent.click(screen.getByRole('button',{name:/Commencer l’enregistrement/i}));
  expect(await screen.findByText(/Enregistrement en cours/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/Arrêter l’enregistrement/i}));
  await waitFor(()=>expect(onChange).toHaveBeenCalledWith(expect.objectContaining({kind:'audio-draft'})));
  const result=onChange.mock.lastCall?.[0];
  expect(result.file.type).toBe('audio/webm');expect(result.file.size).toBeGreaterThan(0);
  expect(stopTrack).toHaveBeenCalled();
  // A re-render with the captured value exposes a native playback control.
  const view=render(<AudioRecorder value={result} onChange={onChange}/>);
  expect(view.container.querySelector('audio[controls]')).toBeTruthy();
  fireEvent.click(view.getByRole('button',{name:/Supprimer/i}));
  expect(onChange).toHaveBeenLastCalledWith(undefined);
 });
 it('gère le refus de permission et propose l’import de fichier',async()=>{
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:vi.fn(async()=>{throw new DOMException('Refused','NotAllowedError')})}});
  render(<AudioRecorder onChange={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:/Commencer l’enregistrement/i}));
  expect(await screen.findByRole('alert')).toHaveTextContent(/Microphone refusé/);
  expect(screen.getByLabelText(/Importer un fichier audio/i)).toBeInTheDocument();
 });
});
