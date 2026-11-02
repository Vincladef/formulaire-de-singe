# FORMULAIRE DE SINGE : audit UX/UI, étape 8

## Périmètre et méthode

Audit statique des composants React de la version 0.7 puis changements de design codés dans la version 0.8.
Les contrôles locaux vérifient le code et le design system ; ils ne sont pas assimilables à des captures d'écran de l'application déployée ni à des essais utilisateurs.

## Avant / après : principaux écrans

| Écran | Avant (v0.7) | Après (v0.8) |
|---|---|---|
| Liste des formulaires | Cartes nombreuses, actions denses | Même accès direct ; états mieux harmonisés, contrastes renforcés |
| Studio, édition | Barre supérieure comprenant Renommer, Dupliquer, Aperçu, Publier, etc. ; ajout des questions en bas de page | Actions secondaires sous « Plus » ; ajout des neuf types en tête de contenu ; titre de question modifiable directement dans la carte |
| Studio, réglages | Réglages d'une question uniquement | Onglets fonctionnels sous forme de commandes « Question » / « Apparence » ; options avancées toujours contextuelles |
| Prévisualisation | Toutes les pages statiques, aspect fixe | Aperçu interactif page par page ou question par question ; couleurs, typographie, fond et boutons réels |
| Formulaire répondant | Style sage fixe, pages entières | Cinq palettes, trois polices, trois fonds, trois boutons, mode par page ou par question ; interface publique sans navigation globale |
| Réponse audio | Micro, minuterie, réécoute et import | Mêmes actions ; onde décorative animée durant la capture ; respect du mouvement réduit |

## Architecture et sécurité

- Le style est stocké dans `fs_forms.settings.theme`, une colonne JSONB existante. Aucune migration SQL nouvelle.
- Le serveur vérifie les droits propriétaire/éditeur et valide les cinq paramètres avec Zod avant mise à jour.
- Le formulaire public ne reçoit que cinq identifiants de préréglages, jamais du CSS arbitraire.
- La duplication conserve maintenant l'apparence ; les versions publiées conservent leurs questions et leurs réponses liées.
- **Limite assumée :** l'apparence est un attribut global du formulaire. Changer le thème d'un questionnaire publié modifie son affichage actuel, mais pas le contenu ni le lien historique des réponses.

## Qualité et accessibilité

- Les cinq accents ont été contrôlés : contraste sur blanc supérieur à 4,5:1 (AA pour texte normal).
- Les textes secondaires trop clairs ont été assombris pour des fonds clairs ; ce contrôle par couleurs ne remplace pas un audit visuel complet.
- Les éléments interactifs utilisent des contours de focus visibles ; l'ordre de lecture suit le DOM.
- Les boutons radio, cases et champs sont étiquetés ; les touches de tabulation permettent de naviguer.
- Une alternative aux déplacements par glisser-déposer reste présente (Monter/Descendre).
- Les animations courtes sont désactivées par `prefers-reduced-motion: reduce`.
- Les outils vocaux utilisent des boutons distincts et de grandes cibles tactiles.
- Le mode question par question est conservé lors de l'enregistrement de la préférence ; il ne modifie pas les champs envoyés.

## Risques et validations nécessaires

- Il faut exécuter `npm install && npm run check` dans un environnement ayant accès aux paquets npm.
- Des tests manuels avec Chrome/Firefox et Safari iOS restent nécessaires, notamment pour les demandes de permission micro et les uploads R2.
- Un audit WCAG complet au lecteur d'écran (VoiceOver, NVDA), une vérification des contrastes de chaque état et des essais sur appareils réels restent à réaliser.
- Les configurations de production `DATABASE_URL`, Neon Auth et R2 doivent être complètes avant d'annoncer que le système vocal fonctionne.
- Les problèmes d'intégration des étapes 6 et 7 ne sont pas résolus par les seuls changements esthétiques.

## Tests ajoutés

- Schéma de personnalisation : rejette le CSS arbitraire et vérifie le repli vers le thème par défaut.
- Interface d'apparence : sélection des préférences et désactivation en lecture seule.
- Aperçu : navigation avant et arrière en mode question par question.
- REST : refus d'une requête non authentifiée et rejet des préréglages invalides.
- Parcours public : passage entre plusieurs questions et retour sans perdre la saisie.

Les résultats d'exécution de Vitest et du build sont à renseigner après exécution en CI.
