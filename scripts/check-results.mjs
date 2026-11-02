import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = (file) => readFileSync(file, 'utf8');
for (const file of [
  'src/shared/results.ts','src/server/resultsRepository.ts','src/server/resultsRestApi.ts',
  'src/pages/ResultsPage.tsx','netlify/functions/results.mts','tests/results-api.test.ts',
  'drizzle/0004_results.sql'
]) assert.ok(existsSync(file), `${file} absent`);
const repo=read('src/server/resultsRepository.ts');
const api=read('src/server/resultsRestApi.ts');
const ui=read('src/pages/ResultsPage.tsx');
const migration=read('drizzle/0004_results.sql');
for(const guard of ['requireForm(userId,formId','s.deleted_at IS NULL','fs_form_members','this.storage.remove','transcript_source'])assert.ok(repo.includes(guard),`Contrôle manquant: ${guard}`);
for(const route of ['results/submissions','results/questions','results/audios','results/export'])assert.ok(read('netlify/functions/results.mts').includes(route),`Route manquante: ${route}`);
assert.match(api,/await identity\(request\)/);
assert.match(api,/private, no-store/);
assert.match(ui,/Non mesuré/);
assert.match(migration,/ADD COLUMN IF NOT EXISTS transcript/);
assert.match(read('src/shared/results.ts'),/safeCsvCell/);
console.log('✓ 7 fichiers de l’étape 7 présents ; garde-fous et routes vérifiés');
