import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { encodePcmToMp3,exportAudioAsMp3,hasMp3Header,MP3_SAMPLE_RATE } from '../src/shared/mp3Export';
beforeEach(()=>vi.stubGlobal('Blob',NodeBlob));
afterEach(()=>vi.unstubAllGlobals());
const tone=(seconds=.5,rate=44100)=>{
 const samples=new Float32Array(Math.round(seconds*rate));
 for(let i=0;i<samples.length;i++)samples[i]=.26*Math.sin(2*Math.PI*440*i/rate);
 return samples;
};
describe('exports MPEG Layer III',()=>{
 it('encodes real MP3 frames from PCM, rather than renaming WebM',async()=>{
  const result=await encodePcmToMp3(tone(0.45),44100);
  const bytes=new Uint8Array(await result.arrayBuffer());
  expect(result.type).toBe('audio/mpeg');
  expect(bytes.length).toBeGreaterThan(2000);
  expect(hasMp3Header(bytes)).toBe(true);
 });
 it('transcodes recorded WebM bytes through browser audio decoding',async()=>{
  const audio=tone(.25);
  const decodeAudioData=vi.fn(async()=>({
   sampleRate:44100,duration:.25,numberOfChannels:1,getChannelData:()=>audio
  }));
  const close=vi.fn(async()=>{});
  class FakeAudioContext{
   decodeAudioData=decodeAudioData;
   close=close;
  }
  vi.stubGlobal('AudioContext',FakeAudioContext);
  const original=new Blob([new Uint8Array([0x1a,0x45,0xdf,0xa3,0x9a])],{type:'audio/webm'});
  const result=await exportAudioAsMp3(original);
  expect(decodeAudioData).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  const out=new Uint8Array(await result.arrayBuffer());
  expect(result.type).toBe('audio/mpeg');
  expect(hasMp3Header(out)).toBe(true);
  expect(out[0]).not.toBe(0x1a);
 });
 it('keeps an already valid MP3 without decoding and without changing its bytes',async()=>{
  const source=new Blob([new Uint8Array([0x49,0x44,0x33,0x03,0,0,0,0,0,0,1,2,3])],{type:'audio/mpeg'});
  const converted=await exportAudioAsMp3(source);
  expect(converted.type).toBe('audio/mpeg');
  expect(new Uint8Array(await converted.arrayBuffer())).toEqual(new Uint8Array(await source.arrayBuffer()));
 });
 it('supports non-44.1 kHz source samples through resampling',async()=>{
  const result=await encodePcmToMp3(tone(.25,48000),48000);
  expect(hasMp3Header(new Uint8Array(await result.arrayBuffer()))).toBe(true);
  expect(MP3_SAMPLE_RATE).toBe(44100);
 });
 it('refuses unsupported compressed audio rather than producing a false MP3 extension',async()=>{
  class FakeAudioContext{decodeAudioData=vi.fn(async()=>{throw Error('unsupported codec');});close=vi.fn(async()=>{});}
  vi.stubGlobal('AudioContext',FakeAudioContext);
  await expect(exportAudioAsMp3(new Blob(['fake'],{type:'audio/webm'}))).rejects.toThrow(/Chrome ou Edge/);
 });
});
