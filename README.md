# 🐒 Formulaire de Singe

Une future plateforme de formulaires élégante et pilotable par ChatGPT, avec des réponses audio natives. **Étape 1 sur 10 : fondations uniquement.**

## Technologies

React 19, TypeScript, Vite 7, Tailwind CSS 4, composants locaux compatibles shadcn/ui, Netlify Functions, Neon PostgreSQL et Drizzle ORM. Cloudflare R2 et MCP sont prévus mais **pas encore connectés**.

## Lancer localement

Prérequis : **Node.js 22.12+** et npm.

```bash
npm install
npm run dev
```

Puis ouvrir http://localhost:5173. La page d'accueil inclut une démonstration locale interactive ; ses réponses ne sont ni transmises ni enregistrées.

Pour tester également la fonction Netlify `GET /api/health` :

```bash
npm run dev:netlify
```

Netlify CLI démarre son propre serveur et affiche l'URL locale. L'endpoint renvoie `status: ok` et `database: not-configured` ; il ne teste volontairement aucune connexion externe.

## Vérifier le code

```bash
npm run smoke     # fonctionne sans installation : contrôle de structure
npm run typecheck
npm run lint
npm run test
npm run build
# ou npm run check pour enchaîner les quatre
```

**Important :** l'étape 1 crée l'organisation des tests et une CI, sans installation ni déploiement Neon. Les packages n'ont pas pu être téléchargés dans l'environnement de génération initial (registre npm inaccessible). La compilation complète et les tests React ne sont donc pas validés ici. Le contrôle `npm run smoke`, l'analyse syntaxique de 19 fichiers TS/TSX et l'analyse TOML sont réussis. Une première installation générera `package-lock.json` ; le committer, puis remplacer `npm install` par `npm ci` dans la CI pour des builds reproductibles.

## Architecture

```text
src/
  components/     Composants réutilisables et primitives UI
  pages/          Accueil et Studio provisoire
  shared/         Contrats Zod partagés entre client et serveur
  server/db/      Schéma Drizzle réservé au serveur (vide à l'étape 1)
  test/           Configuration des tests
netlify/functions/ Fonction de diagnostic (aucun accès aux secrets)
drizzle/          Répertoire des migrations futures
.github/workflows/ Vérifications GitHub Actions
```

## Configurer Netlify

Créer un nouveau site distinct de ceux déjà en production. Relier le dépôt GitHub : branche `main`, commande `npm run build`, répertoire `dist`. Le fichier `netlify.toml` configure les fonctions et la réécriture SPA. Les secrets devront être définis **uniquement** dans les variables d'environnement Netlify, avec la portée Functions.

## Environnement

Voir `.env.example`. Aucun secret n'est nécessaire à l'étape 1. Le navigateur ne doit **jamais** recevoir `DATABASE_URL`, les identifiants R2, ni des secrets de plugin. Ne pas mettre ces secrets dans `netlify.toml`, dans un commit ou dans des variables `VITE_*`.

## Étapes ultérieures

2. Schéma PostgreSQL, migrations et authentification.
3. API REST et preuve de connexion MCP à ChatGPT.
4. Éditeur interactif et sauvegarde des formulaires.
5. Formulaires publics.
6. Réponses vocales natives et stockage privé R2.

## Statut actuel

- Interface minimale, navigation et démonstration de question : code créé.
- Contrats, fonction de diagnostic, configuration Netlify/Drizzle : code créé.
- Neon, R2, authentification, formulaires persistés, MCP : non configurés.
- Tests automatisés et build : à exécuter après installation des dépendances.

## Étape 2 : Neon et protection du Studio

- PostgreSQL dédié : `wispy-hill-09637839`, branche `br-winter-paper-bavpjjxm` et base `formulaire_de_singe`.
- Neon Auth géré par Better Auth, hébergé en Europe. Inscription/connexion `/connexion`, Studio protégé `/studio`.
- Une API protégée `/api/me` exige un JWT Neon Auth valide (signature JWKS et émetteur).
- Modèle Drizzle : `src/server/db/schema.ts`, migration versionnée `drizzle/0000_initial.sql`.
- Contrôles PostgreSQL : structure publiée immuable, réponses liées à la version correspondante, soumission sur version publiée uniquement, contraintes d'intégrité et suppression logique.
- Après configuration du site Netlify, renseigner `DATABASE_URL` en secret ; `NEON_AUTH_URL`, `NEON_AUTH_JWKS_URL`, `VITE_NEON_AUTH_URL` sont des URL non secrètes. Ne jamais préfixer la connexion SQL avec `VITE_`.
- **L'étape 3 développera l'API CRUD et le MCP**. Les fonctions métier `createDraftForOwner`, `publishDraft` et `getFormAccess` sont présentes côté serveur mais ne sont pas exposées publiquement.
- Le navigateur n'a jamais accès à `DATABASE_URL`.

## Étape 3 : API REST et preuve de concept MCP

> Le code est implémenté. La configuration de production n'est **pas** terminée tant que les variables d'environnement Netlify et les tests d'intégration n'ont pas été validés.

### Architecture

`src/shared/formApi.ts` contient les contrats Zod et les types partagés. `src/server/formActions.ts` est la couche métier **unique** ; `src/server/formRepository.ts` applique les contrôles d'accès à PostgreSQL. Les adaptateurs suivants utilisent ces mêmes services :

| Route | Méthode | Résultat | Authentification |
| --- | --- | --- | --- |
| `/api/forms` | GET | Formulaires possédés ou partagés avec l'utilisateur, `?limit=20` | JWT Neon Auth |
| `/api/forms` | POST | Crée un formulaire privé et sa version brouillon ; JSON `{ "title": "Mon enquête" }` | JWT Neon Auth |
| `/api/forms/:id` | GET | Structure, versions, pages, questions, options et règles autorisées | JWT Neon Auth |
| `/api/forms/:id` | PATCH | Renomme le formulaire ; JSON `{ "title": "Nouveau nom" }` | JWT Neon Auth + propriétaire/éditeur |
| `/mcp` | POST | MCP Streamable HTTP avec outils `list_forms`, `create_form`, `get_form` | JWT Neon Auth |

Les réponses REST réussies sont `{ "ok": true, "data": ... }`, et les erreurs `{ "ok": false, "error": { "code": "…", "message": "…" } }`. Les erreurs détaillées de la base ne sont jamais renvoyées au client. Le `userId` provient exclusivement du JWT signé et vérifié ; une demande ne peut pas choisir son propriétaire.

Le MCP fonctionne en mode **sans état** pour Netlify Functions, avec `POST`, `Accept: application/json, text/event-stream` et une instance de transport par requête. Il refuse les appels non authentifiés. **Il n'existe aucun mode administrateur anonyme ni jeton de développement en production.**

### Authentification et configuration Netlify

Neon Auth existant :

- `VITE_NEON_AUTH_URL` : URL publique utilisée par l'interface pour l'inscription et l'ouverture de session. Variable visible au build.
- `NEON_AUTH_URL` : URL publique de référence (serveur uniquement).
- `NEON_AUTH_JWKS_URL` : URL publique de vérification de la signature JWT (serveur uniquement).
- `DATABASE_URL` : chaîne de connexion PostgreSQL, **secret Netlify Functions**, jamais dans GitHub, ni préfixée `VITE_`.

Ces quatre variables doivent être définies **dans le site Netlify existant** `formulaire-de-singe`, avec portée adaptée aux builds pour `VITE_*` et aux fonctions pour `DATABASE_URL`. Refaire un déploiement après modification. La tentative de les configurer automatiquement via le connecteur Netlify a été refusée (HTTP 403) ; vérifier dans l'interface Netlify.

En local, copier `.env.example` dans `.env` et renseigner `DATABASE_URL` de manière sécurisée. Ne committer aucune valeur secrète.

### Tester indépendamment le protocole MCP

Installer les dépendances, puis :

```sh
npm install
npm run test:mcp
npm run check
npm run dev:netlify
```

Une suite Vitest crée un client JSON-RPC **fictif** qui effectue le handshake MCP, découvre les trois outils et vérifie leurs appels avec un dépôt simulé. Une autre suite simule les requêtes REST et vérifie le contrôle d'accès. **Ces tests n'enregistrent aucun participant réel**. Les tests d'intégration en production nécessitent des identifiants Neon Auth réels, sans les inclure dans les scripts.

### État de la connexion ChatGPT

Le serveur `/mcp` expose des outils standards et s'appuie sur la validation JWT de Neon Auth. **La connexion directe à ChatGPT classique n'est pas encore prouvée** : le serveur OAuth 2.1 de Neon Auth n'est pas configuré (`get_auth_oauth_server.enabled = false`), et les variables Netlify ne sont pas installables par le connecteur actuellement. Les outils peuvent être testés avec un client MCP indépendant doté d'un JWT Neon Auth valide. Une connexion ChatGPT nécessitera une solution OAuth gérée, ou un plugin Sites capable de déléguer l'authentification, avec un test d'invocation effectif. On ne propose aucune implémentation OAuth artisanale.

### Étape suivante

La conception du Studio visuel (étape 4) attend la validation de l'étape 3. Ne pas publier de formulaire contenant des données personnelles tant que les contrôles d'authentification et d'accès n'ont pas été confirmés sur le déploiement.


## Étape 4 : Studio visuel

L’éditeur permet de créer et organiser des pages/questions, de modifier titres/options, de sauvegarder les brouillons et de publier une version immuable. Le champ audio est configuré dans l’éditeur ; l'enregistrement effectif sera développé à l’étape 6.

### Déploiement

1. Installer les dépendances : `npm install` (Node 22).
2. Appliquer la migration `drizzle/0001_studio.sql` **après** `0000_initial.sql` avec `npm run db:migrate` ou les outils Neon. La fonction SQL `fs_save_draft` assure l’atomicité des modifications et le contrôle de la révision ; `fs_publish_and_fork` fige la version et prépare une copie modifiable.
3. Dans Netlify, configurer `DATABASE_URL` et les URL `NEON_AUTH_URL`, `NEON_AUTH_JWKS_URL` (portée Functions) ainsi que `VITE_NEON_AUTH_URL` (portée Builds). Ne jamais exposer `DATABASE_URL` au navigateur ni dans GitHub.
4. Pousser vers la branche GitHub reliée au site Netlify. Exécuter `npm run check` et tester une sauvegarde et une actualisation en connexion réelle.
5. Les déplacements de questions au clavier sont disponibles via les boutons « Monter » et « Descendre » ; le glisser-déposer natif reste possible à la souris.

L’API REST privée s’étend à `PUT /api/forms/:id/draft`, `POST /api/forms/:id/publish`, `POST /api/forms/:id/state` et `POST /api/forms/:id/duplicate`. Ces routes réutilisent l’authentification JWT Neon Auth existante. Le serveur MCP de l’étape 3 conserve ses trois outils initiaux.

La suppression est **logique**, elle ne détruit pas les versions publiées ou réponses existantes. Les règles conditionnelles seront développées après l'éditeur de base ; une version qui en contient ne peut pas être publiée avec la fonction de copie actuelle tant que la copie des règles n’est pas implémentée.


## Étape 5 : parcours répondant public (v0.5.0)

- URL permanente après publication : `https://formulaire-de-singe.netlify.app/f/<slug>`. Aucun compte participant n'est demandé.
- `GET /api/public/forms/:slug` renvoie **seulement la dernière version publiée** (titre, pages, questions et options publiques). Les brouillons et formulaires archivés/supprimés ne sont pas accessibles.
- `POST /api/public/forms/:slug/submissions` reçoit `{versionId, clientNonce, consent, website, answers:[{questionId,value}]}`. La version fournie est celle affichée lors de l'ouverture, même si une nouvelle version est publiée entre-temps.
- La migration versionnée `drizzle/0002_public.sql` ajoute un condensat SHA-256 de la requête à `fs_submissions` et la fonction `fs_submit_public` : validations des valeurs/options requises, insertion atomique dans Neon et idempotence par `clientNonce`. Le même envoi renvoie le même ID ; le réemploi d'une clé pour des données différentes est refusé.
- Le formulaire conserve les saisies pendant la navigation entre les pages. Il vérifie les valeurs, les choix multiples, les dates et les champs obligatoires. L'utilisateur peut refuser un consentement requis **sans envoyer de données**.
- L'enregistrement vocal n'est PAS activé à cette étape. Les questions audio sont clairement signalées comme indisponibles ; si elles sont obligatoires, la soumission est bloquée.
- Protection contre les abus : rate limiting déclaré dans Netlify Functions, limite de taille des requêtes, validation stricte Zod + PostgreSQL, champ piège et absence de données personnelles demandées par défaut.
- Tests : `tests/public-api.test.ts`, `src/pages/PublicFormPage.test.tsx`. Le test SQL de création, envoi, répétition et consentement a été exécuté sur Neon dans une transaction annulée volontairement.

**Production** : une configuration manuelle des variables d'environnement reste nécessaire dans Netlify. Tant que l'intégration authentifiée à Neon n'est pas opérationnelle, le Studio et la collecte ne doivent pas être annoncés comme utilisables en production. Ne pas passer à l'étape 6 sans vérifier le déploiement et le build.

## Étape 6 : réponses vocales privées

Les répondants peuvent enregistrer un audio (MediaRecorder) ou importer un fichier WebM, OGG, MP4/M4A, MP3, WAV ou AAC. Le Studio configure les modes **texte**, **audio**, **texte ou audio**, jusqu'à 300 secondes et 15 Mo maximum.

Les fichiers restent localement sur l'appareil avant l'envoi. Après consentement, le navigateur demande un ticket `POST /api/public/forms/:slug/audio/prepare` : Netlify signe une URL `PUT` R2 de 120 secondes. Le navigateur transfère directement l'objet, puis appelle `POST /api/public/forms/:slug/audio/complete`. Le backend vérifie l'objet par HEAD et sa signature binaire par lecture des 64 premiers octets. La transaction `fs_submit_public` lie l'upload au bon formulaire, à la version et à la question, via un ticket unique et secret ; elle nettoie le jeton avant sauvegarde de la réponse. La fonction programmée `audio-cleanup` efface les objets non réclamés à expiration. Une URL GET temporaire de 60 secondes n'est délivrée que par `GET /api/audio/:id` à un propriétaire ou membre authentifié, sans URL publique permanente.

### Configuration préalable

1. Créer un bucket Cloudflare R2 privé, désactiver son accès public, créer une clé API limitée à ce bucket (`Object Read & Write`).
2. Dans les variables d'environnement Netlify (fonctions), ajouter `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`. Ne jamais préfixer les secrets avec `VITE_`.
3. Appliquer la configuration `r2-cors.example.json` aux règles CORS du bucket (remplacer les origines selon les domaines réels).
4. Appliquer `drizzle/0003_audio.sql` à la base `formulaire_de_singe`, **après sauvegarde et vérification** ; garder la migration suivie dans Drizzle. Ne pas l'exécuter deux fois au hasard.
5. Vérifier aussi `DATABASE_URL`, `NEON_AUTH_URL`, `NEON_AUTH_JWKS_URL` et `VITE_NEON_AUTH_URL`, puis relancer un déploiement Netlify.

### Limitation actuelle

La durée est mesurée par le navigateur, et plafonnée côté API selon la déclaration et la configuration du questionnaire. La taille, l'existence et la signature du fichier sont contrôlées côté serveur. La durée *intrinsèque* de chaque conteneur audio n'est pas encore recalculée par un décodeur serveur ; ne pas assimiler le champ `durationMs` à une métadonnée certifiée. Pour une validation antifraude renforcée, ajouter un analyseur audio sur serveur.

Le job programmé `audio-cleanup.mts` reprend aussi l'effacement R2 des participations supprimées dont le transfert a échoué, sous réserve que les variables R2 soient configurées et que la migration audio de l'étape 6 soit appliquée. Les réponses textuelles restent masquées dans PostgreSQL ; elles ne sont pas effacées physiquement par cette version.
