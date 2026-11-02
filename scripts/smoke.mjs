/** Vérification structurelle ne nécessitant aucun package externe. */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const file = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8');
const pkg = JSON.parse(file('package.json'));

assert.equal(pkg.name, 'formulaire-de-singe');
assert.equal(pkg.private, true);
assert.ok(pkg.scripts.build.includes('vite build'));
assert.ok(pkg.scripts.typecheck.includes('tsc'));
for (const required of [
  'index.html', 'src/App.tsx', 'src/pages/HomePage.tsx',
  'src/pages/StudioPage.tsx', 'src/shared/contracts.ts',
  'netlify/functions/health.mts', 'src/server/db/schema.ts',
  'netlify.toml', '.env.example', 'drizzle.config.ts',
  '.github/workflows/ci.yml', 'drizzle/0000_initial.sql',
  'src/pages/AuthPage.tsx', 'src/server/auth.ts', 'netlify/functions/me.mts',
  'src/server/formActions.ts', 'src/server/formRepository.ts', 'src/server/restApi.ts',
  'src/server/mcpServer.ts', 'src/shared/formApi.ts',
  'netlify/functions/forms.mts', 'netlify/functions/mcp.mts',
]) {
  assert.equal(existsSync(resolve(root, required)), true, `${required} absent`);
}
const netlify = file('netlify.toml');
assert.ok(netlify.indexOf('from = "/api/health"') < netlify.indexOf('from = "/*"'));
assert.match(file('netlify/functions/health.mts'), /database: 'not-configured'/);
for (const forbidden of ['VITE_DATABASE_URL', 'VITE_R2_SECRET_ACCESS_KEY']) {
  assert.equal(file('.env.example').includes(forbidden), false);
}
console.log('✓ Manifest, arborescence, configuration Netlify et garde-fous vérifiés');
