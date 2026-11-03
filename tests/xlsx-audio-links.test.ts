import {describe,it,expect} from 'vitest';
import {unzipSync,strFromU8} from 'fflate';
import {xlsxBytes} from '../src/components/studio/ResultsPanel';
describe('export Excel et lien audio privé',()=>{
 it('ajoute une véritable relation de lien externe sur la cellule audio',()=>{
  const zip=unzipSync(xlsxBytes(['Participation','Date','Réponse'],[
   ['abc','03/11/2026 14:04:00','Écouter l’enregistrement']
  ],[{row:2,column:3,url:'https://monk-form.netlify.app/studio/audio/7b1f232a-4f12-4e0b-8fdf-24488ff600c7'}]));
  const xml=strFromU8(zip['xl/worksheets/sheet1.xml']);
  const rels=strFromU8(zip['xl/worksheets/_rels/sheet1.xml.rels']);
  expect(xml).toContain('<hyperlink ref="C2" r:id="rId1"/>');
  expect(rels).toContain('TargetMode="External"');
  expect(rels).toContain('https://monk-form.netlify.app/studio/audio/7b1f232a-4f12-4e0b-8fdf-24488ff600c7');
  expect(xml).toContain('03/11/2026 14:04:00');
 });
});
