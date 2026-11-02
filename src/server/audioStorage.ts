import { S3Client, HeadObjectCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { audioSignature } from '../shared/audio';

export interface AudioStorage {
  presignPut(key:string,type:string):Promise<string>;
  inspect(key:string):Promise<{byteSize:number;mimeType:string;signatureValid:boolean}|null>;
  presignGet(key:string):Promise<string>;
  remove(key:string):Promise<void>;
  read(key:string):Promise<Uint8Array>;
}
let client:S3Client|undefined;
function r2(){
 const id=process.env.R2_ACCOUNT_ID,accessKeyId=process.env.R2_ACCESS_KEY_ID,secretAccessKey=process.env.R2_SECRET_ACCESS_KEY;
 const bucket=process.env.R2_BUCKET_NAME;
 if(!id||!accessKeyId||!secretAccessKey||!bucket)throw new Error('R2 non configuré');
 if(!client)client=new S3Client({region:'auto',endpoint:`https://${id}.r2.cloudflarestorage.com`,credentials:{accessKeyId,secretAccessKey},forcePathStyle:true,requestChecksumCalculation:'WHEN_REQUIRED'});
 return {client,bucket};
}
export class R2AudioStorage implements AudioStorage {
 async presignPut(key:string,type:string){const {client,bucket}=r2();return getSignedUrl(client,new PutObjectCommand({Bucket:bucket,Key:key,ContentType:type}),{expiresIn:120});}
 async inspect(key:string){const {client,bucket}=r2();
  try{
   const head=await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));
   const byteSize=head.ContentLength??0;const mimeType=head.ContentType??'';
   if(byteSize<1||byteSize>15*1024*1024)return {byteSize,mimeType,signatureValid:false};
   // Inspect magic bytes. MIME headers supplied by a browser alone are not trusted.
   const first=await client.send(new GetObjectCommand({Bucket:bucket,Key:key,Range:'bytes=0-63'}));
   const signature=first.Body?await first.Body.transformToByteArray():new Uint8Array();
   return {byteSize,mimeType,signatureValid:audioSignature(signature,mimeType)};
  }catch(e){if(e instanceof Error&&(/NotFound|NoSuchKey|404/.test(e.name)||/404/.test(e.message)))return null;throw e;}
 }
 async presignGet(key:string){const {client,bucket}=r2();return getSignedUrl(client,new GetObjectCommand({Bucket:bucket,Key:key}),{expiresIn:60});}
 async read(key:string){const {client,bucket}=r2();const res=await client.send(new GetObjectCommand({Bucket:bucket,Key:key}));if(!res.Body)throw new Error('Fichier R2 absent');return res.Body.transformToByteArray();}
 async remove(key:string){const {client,bucket}=r2();await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));}
}
