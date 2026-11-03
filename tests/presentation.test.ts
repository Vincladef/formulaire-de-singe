import {describe,it,expect} from 'vitest';
import {audioPlaybackUrl,formatParisDate,formatParisDateTime} from '../src/shared/presentation';
describe('dates et liens protégés des exports',()=>{
 it('affiche l’heure d’hiver à Paris depuis UTC',()=>{
  expect(formatParisDateTime('2026-11-03T13:04:00.000Z')).toBe('03/11/2026 14:04:00');
 });
 it('gère automatiquement l’heure d’été et le changement de jour',()=>{
  expect(formatParisDateTime('2026-07-20T22:30:00.000Z')).toBe('21/07/2026 00:30:00');
  expect(formatParisDate('2026-07-20T22:30:00.000Z')).toBe('21/07/2026');
 });
 it('ne convertit pas un faux horodatage',()=>{
  expect(formatParisDateTime('invalid')).toBe('');
  expect(formatParisDateTime(null)).toBe('');
 });
 it('produit une URL d’audio privée sans jeton dans les paramètres',()=>{
  const id='db9ab93b-39bb-4934-9787-9edc5c2b5d45';
  expect(audioPlaybackUrl(id)).toBe('https://monk-form.netlify.app/studio/audio/'+id);
  expect(()=>audioPlaybackUrl('../api/secrets')).toThrow('Identifiant audio invalide');
 });
});
