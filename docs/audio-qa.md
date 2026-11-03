# Parcours audio : architecture, limites et plan de recette

## Chemin rapide (0 à 3 Mio, inclus)
- Le navigateur démarre le transfert dès la fin de l'enregistrement, indépendamment de la soumission finale.
- `POST /api/public/forms/:slug/audio/direct` transmet le Blob brut avec le numéro de version, la question, le nonce et la durée déclarée dans des en-têtes.
- Le serveur limite la requête à 3 Mio, vérifie la signature du fichier, les autorisations de la question, le volume et la durée autorisés et le quota d'essais.
- Le serveur crée un ticket à usage unique, écrit **une seule fois** l'objet final dans Netlify Blobs, puis marque le ticket `verified` dans Neon.
- Le client conserve la preuve de transfert jusqu'au clic final : aucun message de réussite de participation avant le succès de `POST /submissions`.
- Ce chemin évite les appels `prepare`, `parts`, `complete` et les objets temporaires.
- Une connexion avec un client et un serveur de versions différentes peut retomber sur le multipart si le chemin direct répond 404 ou 405.

## Chemin multipart (> 3 Mio, jusqu'à 15 Mio)
- Le navigateur demande un ticket `prepare`, puis téléverse les portions en parallèle (3 en vol maximum).
- Chaque portion conserve la taille historique de **2 Mio** pour permettre aux clients et tickets déjà émis de terminer après déploiement.
- Les portions en échec transitoire sont renvoyées, sans créer un nouveau ticket pour les portions réussies. Le stockage `onlyIfNew` rend le réenvoi de la même portion idempotent.
- `complete` reconstitue le fichier en respectant l'ordre, valide la signature et ne confirme la disponibilité qu'après stockage final.
- Les enregistrements abandonnés restent en attente au plus 24 heures ; un nettoyage est déclenché quatre fois par jour. La limite de 30 tickets par passage est volontairement prudente, afin de préserver les 30 secondes maximales d'une fonction planifiée.
- La fonction multipart accepte jusqu'à 90 requêtes / minute et par clé de limitation ; le chemin direct dispose de sa propre limite de 45 requêtes / minute.

## Synchronisation des résultats
- `public-forms` déclenche déjà la synchronisation Google Sheets en tâche asynchrone après une participation enregistrée.
- `google-sheets-sync` effectue désormais un rattrapage toutes les **15 minutes**, au lieu de deux minutes : réduction des invocations à vide de 21 600 à 2 880 environ par période de 30 jours.
- Les réponses ne disparaissent pas lorsqu'une synchronisation externe est temporairement indisponible.

## Recette manuelle et vérifications de régression
1. Android Chrome et Safari iOS : microphone autorisé/refusé, début/fin, préécoute, recommencer.
2. Enregistrer 20 secondes : un seul `POST /audio/direct` ; aucun `prepare`, `parts`, `complete`.
3. Ajouter une note écrite à l'audio et envoyer : vérifier les deux contenus côté résultat.
4. Répondre en texte seul dans la variante « Audio + texte » ; tester l'absence de réponse obligatoire.
5. Importer MP3, WAV, M4A et WebM : valider les fichiers autorisés ; rejeter une signature ou durée invalide.
6. Envoyer 3,1 Mio puis 15 Mio : chemin multipart ; vérifier les portions reçues et la reconstruction.
7. Simuler une erreur transitoire pendant une portion : réessai de cette même portion ; les portions réussies ne repartent pas.
8. Forcer un échec réseau : le formulaire ne doit pas afficher de succès et les réponses doivent rester éditables.
9. Soumettre deux fois avec le même nonce et le même corps : une seule participation en base (idempotence).
10. Tester la lecture depuis un autre compte, qui doit être refusée ; puis vérifier les exports MP3 et les données Google Sheets.
11. Vérifier les traces Netlify, la limite native des fonctions et le prochain lancement de la synchronisation périodique.
12. Tester le déploiement pendant un ancien transfert multipart afin de conserver la compatibilité des portions à 2 Mio.

## Limites et vigilance
- La durée réelle n'est pas recalculée sur le serveur, seule celle déclarée côté client est validée.
- Un nombre élevé de fichiers soumis exactement au même moment peut encore provoquer une attente ; le prétransfert évite l'essentiel de ce coût sur les pages de formulaire.
- Les sorties de Netlify Blobs (stockage privé) et les requêtes Neon restent sujettes aux quotas de chaque fournisseur.
- La région effective des fonctions Netlify doit être confirmée dans le tableau de bord : Neon et Netlify Blobs sont configurés en `eu-central-1`.
