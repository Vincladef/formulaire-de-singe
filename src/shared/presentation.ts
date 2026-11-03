/** Keep UTC timestamps in Neon; present dates consistently in the Europe/Paris IANA zone. */
export const PARIS_ZONE='Europe/Paris';
export function formatParisDateTime(value:string|Date|null|undefined):string{
 if(!value)return '';
 const d=value instanceof Date?value:new Date(value);
 if(Number.isNaN(d.getTime()))return '';
 const parts=new Intl.DateTimeFormat('fr-FR',{timeZone:PARIS_ZONE,year:'numeric',
  month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(d);
 const part=(name:string)=>parts.find(p=>p.type===name)?.value??'';
 return [part('day'),part('month'),part('year')].join('/')+' '+[part('hour'),part('minute'),part('second')].join(':');
}
export function formatParisDate(value:string|Date|null|undefined):string{
 return formatParisDateTime(value).split(' ')[0]??'';
}
export function audioPlaybackUrl(audioId:string,origin='https://monk-form.netlify.app'):string{
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(audioId))throw Error('Identifiant audio invalide');
 return origin.replace(/\/$/,'')+'/studio/audio/'+audioId;
}
