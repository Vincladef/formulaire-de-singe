import { describe,expect,it } from 'vitest';
import { csvCell,resultsCsv } from '../src/server/mcpExport';
import type { FormResults } from '../src/server/resultsService';

describe('MCP exports de données',()=>{
 it('échappe les formules et les cellules CSV',()=>{
  expect(csvCell('=HYPERLINK("https://unsafe", "click")')).toBe('"'+"'"+'=HYPERLINK(""https://unsafe"", ""click"")"');
  expect(csvCell('  +42')).toBe('"\'  +42"');
  expect(csvCell('Réponse "libre", oui')).toBe('"Réponse ""libre"", oui"');
  expect(csvCell(null)).toBe('""');
 });
 it('génère une ligne par participation et les transcriptions seulement sur demande',()=>{
  const data:FormResults={
   formId:'a199b8df-c28e-420e-a725-0f4c5caf7080',title:'Exemple',slug:'exemple',page:0,limit:100,total:1,
   submissions:[{id:'88cb22e7-2611-4c8f-82d3-4b3510f8b93f',submittedAt:'2026-11-07T14:00:00.000Z',
    answers:[{questionId:'f0244c28-47c6-46ec-ace2-2cfed7ac1ac5',question:'Avis',type:'long_text',
     value:'Bonne expérience',audioId:null,durationMs:null,transcript:'Réponse orale'}]}],
  };
  const without=resultsCsv(data,false);
  const withTranscript=resultsCsv(data,true);
  expect(without).toContain('Bonne expérience');
  expect(without).not.toContain('Réponse orale');
  expect(withTranscript).toContain('Réponse orale');
  expect(withTranscript).toContain('07/11/2026');
 });
});
