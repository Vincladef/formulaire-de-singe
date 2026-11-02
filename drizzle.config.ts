import { defineConfig } from 'drizzle-kit';

// La connexion et les premières tables seront ajoutées à l'étape 2.
// Aucune migration n'est appliquée lors des fondations.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://placeholder:placeholder@localhost:5432/formulaire_de_singe',
  },
  strict: true,
  verbose: true,
});
