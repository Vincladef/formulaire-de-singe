# Formulaire de Singe : étape 9, plugin ChatGPT MCP

## Statut vérifiable

- API REST : celle des étapes 3 à 8 est réutilisée, sans nouveau moteur métier.
- Serveur MCP Streamable HTTP : `POST https://formulaire-de-singe.netlify.app/mcp`.
- Métadonnées OAuth Protected Resource (RFC 9728) : `GET https://formulaire-de-singe.netlify.app/.well-known/oauth-protected-resource/mcp`.
- Onze outils : `list_forms`, `get_form`, `create_form`, `update_form`, `add_questions`, `update_question`, `publish_form`, `list_submissions`, `get_submission`, `get_audio`, `export_results`.
- Toutes les commandes privées utilisent le `sub` d'un jeton OAuth d'utilisateur, **jamais** un identifiant proposé par le modèle.
- Les exportations MCP CSV/JSON sont limitées à 100 Ko pour éviter de saturer le contexte. Les ZIP audio sont accessibles par le Studio authentifié.
- La publication exige `confirmPublication:true` après accord humain, mais le client ChatGPT doit également imposer sa propre confirmation. Un booléen seul ne démontre pas une interaction humaine.
- Le serveur ne fournit pas d'outil de suppression.

## Authentification gérée, pas artisanale

L'échange OAuth (connexion, consentement, code PKCE, refresh token) doit être effectué par **Neon Auth / Better Auth OAuth Provider géré**. Ce projet **ne génère ni ne stocke de tokens OAuth**. Le serveur MCP vérifie localement la signature EdDSA, l'issuer exact, l'audience correspondant à `/mcp`, l'expiration et `sub` via les JWKS de Neon Auth. Les tokens DPoP-bound sont rejetés si aucune preuve n'est vérifiée ; la compatibilité DPoP nécessitera un vérificateur dédié et un stockage de nonces partagé.

### Variables Netlify

Configurer dans Netlify > Project configuration > Environment variables, côté Functions :

- `DATABASE_URL` : URL PostgreSQL, **secret**.
- `NEON_AUTH_URL` : URL Neon Auth complète, sans slash final.
- `NEON_AUTH_JWKS_URL` : `${NEON_AUTH_URL}/.well-known/jwks.json`, URL publique.
- `MCP_RESOURCE` : `https://formulaire-de-singe.netlify.app/mcp`.
- `PUBLIC_SITE_ORIGIN` : `https://formulaire-de-singe.netlify.app`.

Le frontend utilise séparément `VITE_NEON_AUTH_URL`. Les secrets ne doivent jamais être préfixés `VITE_`.

### Activation de Neon Auth OAuth

1. L'application dispose d'une page `/connexion`, mais **aucune page de consentement OAuth dédiée, fonctionnelle et testée** n'existe encore. Implémenter et vérifier la page d'autorisation en utilisant le SDK Neon Auth et le consentement Better Auth avant toute activation.
2. Dans Neon, activer OAuth Provider géré avec `login_page` pointant vers la page de connexion et `consent_page` vers la page d'autorisation fonctionnelle ; configurer `mcp.resource` exactement sur l'URL `/mcp` (ressource HTTPS).
3. Préférer `client_id_metadata_documents=true` ; ne pas activer l'enregistrement dynamique non contrôlé ni contourner le consentement.
4. Tester le serveur avec MCP Inspector : découverte OAuth, connexion, consentement, accès à `tools/list`, création de brouillon fictif et lecture ; tester aussi refus d'un jeton destiné à une autre audience.
5. Connecter ensuite le serveur depuis ChatGPT si **le compte et la surface** autorisent un serveur MCP externe. Sur compte personnel, la voie de plugin hébergé par ChatGPT Sites peut nécessiter un quota Sites/Codex distinct. Ne pas confondre un plugin de consignes avec une application MCP connectée.

Ne jamais marquer cette étape « connectée à ChatGPT classique » sans avoir lancé un outil réel de ce plugin depuis une discussion et retrouvé la modification dans Neon.

### Commandes de test locales

```bash
npm install
npm run typecheck
npm run lint
npm run test
npm run build
npx @modelcontextprotocol/inspector
```

Tester `initialize`, `tools/list`, puis `tools/call` depuis MCP Inspector avec un vrai jeton OAuth émis pour la ressource `/mcp`, **pas** avec un jeton destiné au site web. Les tests automatisés `tests/mcp.test.ts` simulent l'identité et les services métier ; ils ne démontrent pas à eux seuls le fonctionnement du consentement OAuth, de R2 ni la compatibilité de ChatGPT.

## Cas de test requis

- Accès sans jeton : HTTP 401 avec `WWW-Authenticate` indiquant la ressource OAuth.
- Jeton mauvais issuer, audience, signature, expiration ou DPoP sans preuve : rejet.
- Un compte non autorisé ne doit pas voir le formulaire, les résultats, ni les audios d'autrui.
- `create_form` crée un brouillon privé ; `add_questions` et `update_question` mettent à jour la révision en protégeant contre les conflits.
- `publish_form` refuse toute requête sans confirmation explicite.
- `list_submissions`, `get_submission` et `export_results` appliquent les droits déjà définis par l'API REST.
- `get_audio` génère uniquement un lien R2 temporaire via le service audio.
- Un appel véritable depuis ChatGPT classique reste indispensable pour conclure à la compatibilité.

## Limites des étapes précédentes

La configuration Netlify et Cloudflare R2, ainsi que la migration audio `0003_audio.sql`, restent à valider si elles ne l'ont pas déjà été. La présence du code source ne suffit pas à démontrer que l'enregistrement et les exports fonctionnent en production.
