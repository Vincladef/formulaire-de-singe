import { MAX_AUDIO_SECONDS } from './audio';

export const MP3_BITRATE_KBPS=96;
export const MP3_SAMPLE_RATE=44100;
const MP3_BLOCK_SIZE=1152;

/** Inspect actual file bytes, not just an untrustworthy MIME type or filename. */
export function hasMp3Header(bytes:Uint8Array):boolean{
 return (bytes.length>=3&&bytes[0]===0x49&&bytes[1]===0x44&&bytes[2]===0x33)
  || (bytes.length>=2&&bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0);
}

export type ExportProgress=(fraction:number)=>void;

/** Encodes real MPEG Layer III frames. Supports stereo sources by mixing to speech-friendly mono.
 * Resamples in small blocks to keep memory bounded, without a second PCM AudioBuffer.
 */
async function encodeMp3(
 channels:readonly Float32Array[],sampleRate:number,
 onProgress?:ExportProgress,
):Promise<Blob>{
 if(!channels.length||!channels[0]?.length||!Number.isFinite(sampleRate)||sampleRate<8000)throw Error('Audio invalide.');
 const duration=channels[0].length/sampleRate;
 if(duration>MAX_AUDIO_SECONDS+2)throw Error('Enregistrement trop long pour l’export MP3.');
 const {Mp3Encoder}=await import('@breezystack/lamejs');
 const encoder=new Mp3Encoder(1,MP3_SAMPLE_RATE,MP3_BITRATE_KBPS);
 const out:Uint8Array[]=[];
 const total=Math.max(1,Math.round(duration*MP3_SAMPLE_RATE));
 const pcm=new Int16Array(MP3_BLOCK_SIZE);
 const left=channels[0],right=channels.length>1?channels[1]:null;
 let chunkCount=0,byteCount=0;
 for(let offset=0;offset<total;offset+=MP3_BLOCK_SIZE){
  const count=Math.min(MP3_BLOCK_SIZE,total-offset);
  for(let i=0;i<count;i++){
   const position=(offset+i)*sampleRate/MP3_SAMPLE_RATE;
   const a=Math.min(left.length-1,Math.floor(position));
   const b=Math.min(left.length-1,a+1);
   const alpha=position-a;
   const valueLeft=left[a]*(1-alpha)+left[b]*alpha;
   let value=valueLeft;
   if(right){
    const valueRight=right[a]*(1-alpha)+right[b]*alpha;
    value=(valueLeft+valueRight)/2;
   }
   const limited=Math.max(-1,Math.min(1,value));
   pcm[i]=Math.round(limited<0?limited*32768:limited*32767);
  }
  const encoded=encoder.encodeBuffer(pcm.subarray(0,count));
  if(encoded.length){const copy=encoded.slice();out.push(copy);byteCount+=copy.length;}
  if(++chunkCount%120===0){onProgress?.(Math.min(.99,(offset+count)/total));await new Promise<void>(resolve=>setTimeout(resolve,0));}
 }
 const last=encoder.flush();
 if(last.length){const copy=last.slice();out.push(copy);byteCount+=copy.length;}
 if(!byteCount)throw Error('Conversion MP3 vide.');
 const bytes=new Uint8Array(byteCount);let current=0;
 for(const part of out){bytes.set(part,current);current+=part.length;}
 if(!hasMp3Header(bytes))throw Error('Le fichier généré ne contient pas de trames MP3 valides.');
 onProgress?.(1);
 return new Blob([bytes.buffer],{type:'audio/mpeg'});
}

/** Pure PCM entry point, also used in automated tests to verify genuine MP3 output. */
export async function encodePcmToMp3(samples:Float32Array,sampleRate:number,onProgress?:ExportProgress):Promise<Blob>{
 return encodeMp3([samples],sampleRate,onProgress);
}

/** Convert recorded WebM, Ogg, M4A or WAV at export time, preserving the original for playback.
 * Already valid MP3 bytes are reused as-is instead of degrading them with a second encoding.
 */
export async function exportAudioAsMp3(original:Blob,onProgress?:ExportProgress):Promise<Blob>{
 if(!original.size)throw Error('Enregistrement audio vide.');
 const head=new Uint8Array(await original.slice(0,10).arrayBuffer());
 if(hasMp3Header(head)){
  onProgress?.(1);
  return new Blob([original],{type:'audio/mpeg'});
 }
 if(typeof window==='undefined')throw Error('La conversion MP3 nécessite un navigateur.');
 const Ctx=window.AudioContext||(window as Window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
 if(!Ctx)throw Error('La conversion MP3 n’est pas disponible dans ce navigateur.');
 let context:AudioContext;
 try{context=new Ctx({sampleRate:MP3_SAMPLE_RATE});}
 catch{context=new Ctx();}
 let buffer:AudioBuffer;
 try{
  buffer=await context.decodeAudioData(await original.arrayBuffer());
 }catch{
  throw Error('Ce navigateur ne peut pas décoder cet audio. Essaie Chrome ou Edge pour l’export MP3.');
 }finally{await context.close().catch(()=>{});}
 const channels=Array.from({length:Math.min(2,buffer.numberOfChannels)},(_,i)=>buffer.getChannelData(i));
 return encodeMp3(channels,buffer.sampleRate,onProgress);
}
