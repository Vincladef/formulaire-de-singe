import { z } from 'zod';

export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
export const AUDIO_PART_BYTES = 2 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 1800;
export const audioMimeTypes = ['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-m4a','audio/aac'] as const;
export type AnswerMode = 'text' | 'audio' | 'either';
export const uploadedAudioSchema = z.object({
 kind: z.literal('audio'), uploadId: z.string().uuid(), claimToken: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type UploadedAudio = z.infer<typeof uploadedAudioSchema>;
export type AudioDraft = { kind: 'audio-draft'; file: Blob; durationMs: number };
export const audioPrepareSchema = z.object({
 versionId:z.string().uuid(), questionId:z.string().uuid(), clientNonce:z.string().uuid(),
 consent:z.literal(true), mimeType:z.enum(audioMimeTypes),byteSize:z.number().int().positive().max(MAX_AUDIO_BYTES),
 durationMs:z.number().int().positive().max(MAX_AUDIO_SECONDS * 1000),
}).strict();
export const audioCompleteSchema = z.object({
 uploadId:z.string().uuid(),claimToken:z.string().regex(/^[a-f0-9]{64}$/),clientNonce:z.string().uuid(),
}).strict();
export function audioMode(type:string,settings?:Record<string,unknown>):AnswerMode {
 if(type==='audio')return 'audio';
 if(type!=='short_text'&&type!=='long_text')return 'text';
 return settings?.answerMode==='audio'||settings?.answerMode==='either'?settings.answerMode:'text';
}
export function audioLimits(settings?:Record<string,unknown>) {
 const seconds=settings?.maxAudioSeconds, bytes=settings?.maxAudioBytes;
 return {
  maxSeconds:typeof seconds==='number'&&Number.isInteger(seconds)?Math.max(15,Math.min(MAX_AUDIO_SECONDS,seconds)):600,
  maxBytes:typeof bytes==='number'&&Number.isInteger(bytes)?Math.max(1048576,Math.min(MAX_AUDIO_BYTES,bytes)):MAX_AUDIO_BYTES,
 };
}
export function normalizedMime(mime:string){return mime.split(';')[0].trim().toLowerCase()}
export function audioSignature(bytes:Uint8Array,mime:string) {
 const eq=(offset:number,chars:string)=>[...chars].every((ch,i)=>bytes[offset+i]===ch.charCodeAt(0));
 switch(normalizedMime(mime)) {
 case 'audio/webm':return bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3;
 case 'audio/ogg':return eq(0,'OggS');
 case 'audio/mp4':case 'audio/x-m4a':return eq(4,'ftyp');
 case 'audio/wav':return eq(0,'RIFF')&&eq(8,'WAVE');
 case 'audio/mpeg':return eq(0,'ID3')||(bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0);
 case 'audio/aac':return bytes[0]===0xff&&(bytes[1]&0xf0)===0xf0;
 default:return false;
 }
}
