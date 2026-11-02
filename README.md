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
## Éditeur-document et intégration Google Sheets

Le Studio permet de composer des paragraphes, titres et citations parmi les questions. Dans un bloc de texte, taper `/` pour ouvrir le menu des éléments ; `Entrée` crée un nouveau paragraphe. Les boutons `+` et les outils latéraux insèrent une question à la dernière position du curseur. Si l'insertion intervient au milieu d'un texte, les deux fragments sont conservés de part et d'autre du nouveau champ. Les identifiants des questions existantes ne sont pas modifiés.

### Activer Google Sheets

1. Appliquer la migration `drizzle/0007_google_sheets.sql` sur la base Neon utilisée par l'application ; vérifier l'historique Drizzle.
2. Dans Google Cloud, activer **Google Sheets API**, configurer l'écran de consentement OAuth et créer un client OAuth **Application Web**. Ajouter à ses URI de redirection autorisées `https://monk-form.netlify.app/api/integrations/google/callback` (adapter si domaine personnalisé).
3. Définir dans Netlify, côté **Functions** uniquement : `GOOGLE_SHEETS_CLIENT_ID`, `GOOGLE_SHEETS_CLIENT_SECRET`, `GOOGLE_SHEETS_REDIRECT_URI`, `GOOGLE_SHEETS_TOKEN_KEY` (32 octets encodés en base64) et `GOOGLE_SHEETS_STATE_SECRET` (au moins 32 caractères aléatoires). Ne jamais ajouter ces secrets à Git.
4. Redéployer le site ; ouvrir un formulaire > **Intégrations** > **Connecter mon compte Google**. Après autorisation, l'application crée une feuille privée `Monk Form · ...` dans le Drive de l'utilisateur et y synchronise les réponses.
5. La synchronisation lance un premier passage après chaque soumission (sans ralentir la confirmation au répondant), puis un rattrapage toutes les 2 minutes. La table `fs_sheet_deliveries` conserve les reprises et les erreurs ; chaque ligne est identifiée par l'UUID de soumission pour éviter les doubles lignes au réessai.

**Limites et garde-fous :** cette intégration est impossible tant que les variables OAuth ne sont pas installées ; l'interface l'indique explicitement. Le connecteur crée une nouvelle feuille par formulaire ; la sélection d'une feuille existante n'est pas encore proposée. Les fichiers audio ne sont pas exposés dans Sheets ; une mention signale leur présence. Un propriétaire peut arrêter la synchronisation sans supprimer son tableur, et relancer les soumissions en erreur. Le scope Google demandé se limite aux feuilles de calcul.

### Contrôles de non-régression

```sh
npm run check
```

Vérifier aussi manuellement : insertion avant/après un paragraphe, insertion au milieu d'un texte, saisie au clavier, conservation des choix et enregistrements audio, aperçu, publication, soumission publique puis apparition de la réponse dans Google Sheets après activation OAuth.
