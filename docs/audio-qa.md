# Parcours audio : plan de recette manuelle

## Conditions de départ
- Migration `0003_audio.sql` appliquée après sauvegarde ; variables Neon et R2 présentes côté Netlify.
- Bucket R2 privé, CORS autorisant `PUT` depuis le vrai domaine ; aucune exposition `r2.dev`.
- Formulaire publié contenant une question « audio uniquement » et une autre « texte ou audio » avec consentement.

## Vérifications navigateur
1. Android Chrome : autoriser le micro, enregistrer 15 secondes, arrêter, réécouter, recommencer, supprimer, puis renvoyer un nouvel enregistrement.
2. Safari iPhone : vérifier le format de sortie (MP4 si pris en charge) ; refuser puis réautoriser le micro ; tester le changement d'onglet et une interruption de capture.
3. Importer M4A, MP3, WAV, OGG et WebM ; tester un fichier plus grand que la limite, un format inconnu et un fichier sans durée lisible.
4. Revenir à la page précédente : la réponse non envoyée reste dans le formulaire ; revenir et vérifier l'aperçu.
5. Refuser le consentement : aucun appel aux endpoints `/audio/prepare` ou `/submissions` ne doit partir.
6. Consentir, puis envoyer : POST `prepare`, PUT direct R2, POST `complete`, POST soumission, dans cet ordre.
7. Faire échouer le PUT R2 : le questionnaire doit afficher l'erreur ; aucun POST `/submissions` ne doit réussir.
8. Cliquer deux fois sur Envoyer / relancer le réseau : un seul identifiant de soumission doit exister.
9. Depuis un autre compte, demander `GET /api/audio/:id` : la réponse doit être 404 ou 401 ; le propriétaire obtient une URL valable 60 secondes.
10. Vérifier que les objets R2 restent privés et que l'exécution planifiée `audio-cleanup` retire les tickets abandonnés après expiration.

## Limites et vigilance
- Le temps intrinsèque d'un fichier n'est pas encore recalculé par le serveur ; seul le temps déclaré côté navigateur est comparé à la configuration. Ne pas considérer cette durée comme une garantie antifraude.
- Aucun parcours R2 ni Safari réel n'est validé tant que le bucket et les variables de production ne sont pas configurés.
