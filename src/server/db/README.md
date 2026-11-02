# PostgreSQL / Étape 2

Projet dédié : `wispy-hill-09637839`, base `formulaire_de_singe` (Francfort). Ne pas toucher aux autres projets.

- Schéma Drizzle : `schema.ts` ; source typée pour le code serveur.
- Migration SQL versionnée : `../../../drizzle/0000_initial.sql` et journal Drizzle.
- `npm run db:migrate` applique les migrations non encore jouées ; fournir `DATABASE_URL` uniquement côté serveur.
- Les identifiants propriétaires sont des ID issus de Neon Auth, jamais des ID acceptés du navigateur.
- La version publiée reste immuable grâce aux déclencheurs PostgreSQL. Après publication, créer une nouvelle version brouillon avant modification.
- `deleted_at` matérialise la suppression logique des formulaires, soumissions et audios. Les suppressions physiques et la rétention feront l'objet d'une procédure dédiée, avec retrait des objets R2.
- Les règles conditionnelles vérifient que la question source et la cible appartiennent à la même version.
- Les réponses refusent tout mélange entre une soumission et les questions d'une autre version.
- Les tables `neon_auth.*` sont gérées par Neon Auth ; ne pas les inclure dans les migrations Drizzle applicatives.

La fonction `/api/me` nécessite un **Bearer JWT de Neon Auth**, vérifié sur JWKS et issuer. Elle retourne 401 sans jeton, 503 si le fournisseur n'est pas configuré. Le Studio utilise le client React de Neon Auth. Les endpoints métier viendront à l'étape 3.
