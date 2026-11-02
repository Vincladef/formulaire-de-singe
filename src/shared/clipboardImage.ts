import { allowedInlineImage } from './richText';

/** Resize a pasted browser image to a bounded, durable inline asset.
 * No third-party hosting, no remote URLs and no unbounded draft payloads.
 */
export async function clipboardImageToDataUrl(file:File):Promise<string>{
 if(!/^image\/(?:png|jpeg|webp|gif)$/i.test(file.type))throw new Error('Image non prise en charge (PNG, JPEG, WebP ou GIF).');
 if(!file.size||file.size>10*1024*1024)throw new Error('Image trop volumineuse (10 Mo maximum avant compression).');
 const objectUrl=URL.createObjectURL(file);
 const image=new Image();
 try{
  await new Promise<void>((resolve,reject)=>{
   image.onload=()=>resolve();
   image.onerror=()=>reject(new Error('Impossible de lire cette image.'));
   image.src=objectUrl;
  });
  const width=image.naturalWidth,height=image.naturalHeight;
  if(!width||!height||width*height>55000000)throw new Error('Dimensions de l’image non prises en charge.');
  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('Compression d’image indisponible dans ce navigateur.');
  let scale=Math.min(1,1200/Math.max(width,height));
  for(let attempt=0;attempt<8;attempt++){
   canvas.width=Math.max(1,Math.round(width*scale));
   canvas.height=Math.max(1,Math.round(height*scale));
   ctx.clearRect(0,0,canvas.width,canvas.height);
   ctx.fillStyle='#ffffff';
   ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.drawImage(image,0,0,canvas.width,canvas.height);
   const quality=Math.max(.45,.88-attempt*.055);
   let value=canvas.toDataURL('image/webp',quality);
   if(!value.startsWith('data:image/webp;'))value=canvas.toDataURL('image/jpeg',quality);
   if(allowedInlineImage(value))return value;
   scale*=.82;
  }
  throw new Error('Image trop complexe à intégrer ; essayez une version plus petite.');
 }finally{
  URL.revokeObjectURL(objectUrl);
 }
}
