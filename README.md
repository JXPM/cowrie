# Cowrie

Application de budget mensuel, 100 % statique (un seul fichier `index.html`), installable sur téléphone (PWA).

## Ce que fait l'app (v2)

- **Configuration guidée** : salaire et jour de versement, puis loyer, abonnements, transport, courses, restaurants, shopping. Un anneau montre le restant en direct, et une animation de liasse de billets affiche l'épargne possible.
- **Budget** : navigation par mois, vues Calendrier (prélèvements, salaire et dépenses par jour), Budget (prévu / réel, % d'épargne, catégories par groupe, diagramme « Où part ton argent ») et Prévision (fin de mois au rythme actuel, catégories à surveiller).
- **Patrimoine** : comptes affichés en cartes (courant, livret, Mobile Money…), total, courbe d'évolution et répartition.
- **Objectifs** : cartes illustrées avec effet 3D (paysage ou photo), versements, crédits et trajectoire d'épargne.
- **Activité** : dépenses et revenus du mois, avec filtres. Le solde du compte choisi se met à jour automatiquement.
  - **À confirmer** : les revenus et prélèvements à date fixe arrivés à échéance s'affichent ; ✓ pour les confirmer, crayon pour changer le montant ou les ignorer ce mois-ci.
  - **Paiements Apple Pay** : l'automatisation Raccourcis « Transaction » envoie chaque paiement à `POST /api/tx` (en-tête `x-app-key`, corps JSON `{amount, merchant, card}`). L'app les importe à l'ouverture et devine la catégorie d'après le commerçant.
- Devises : €, FCFA, $, $ CA. Thème clair et sombre.

## Données

- Les données sont enregistrées dans le navigateur (`localStorage`, clé `cowrie.v2`).
- Synchro entre appareils : dans Patrimoine → Réglages, entre ton mot de passe. Le budget est stocké dans Neon sous la clé `budget-v2` (propriétaire) ou `budget-v2:<nom>` via `/api/state2` (variables `DATABASE_URL` et `APP_USERS`, ou `APP_PASSWORD` en mode historique).

## Plusieurs comptes

Chaque personne a son mot de passe et ses propres données. Personne ne voit les données d'un autre.

- `APP_USERS` : liste `nom:motdepasse,nom2:motdepasse2`, par exemple `johan:xxxxxxxxxxxxxxxx,soeur:yyyyyyyyyyyyyyyy`.
  - nom : lettres minuscules, chiffres ou `-`, 32 caractères au plus ;
  - mot de passe : 12 caractères au moins, sans virgule (il peut contenir `:`) ;
  - une entrée invalide est ignorée et signalée dans les journaux Vercel, sans afficher le mot de passe.
- `APP_OWNER` (défaut `johan`) : le propriétaire garde les clés historiques `budget-v2` et `inbox-v1`, donc ses données actuelles, sans migration. Les autres ont `budget-v2:<nom>` et `inbox-v1:<nom>`.
- Compatibilité : si `APP_USERS` est absente, `APP_PASSWORD` marche exactement comme avant (compte du propriétaire). Dès que `APP_USERS` existe, `APP_PASSWORD` n'est plus lu : le propriétaire doit donc figurer dans `APP_USERS`.
- Ajouter ou retirer une personne : modifier `APP_USERS` dans Vercel puis redéployer. Retirer une personne coupe son accès mais ne supprime pas ses données.
- Le compte est déduit du mot de passe seulement, jamais d'un champ de la requête.
- Raccourci Apple Pay : chacun met son propre mot de passe dans l'en-tête `x-app-key` ; le paiement arrive dans sa boîte.
- Même appareil, deux personnes : l'app mémorise à qui appartiennent les données locales (`cowrie-user`). Si on se connecte avec le compte d'une autre personne, rien n'est envoyé : une fenêtre demande soit de remplacer les données de l'appareil par celles du nouveau compte (les anciennes restent sur le serveur), soit d'annuler (déconnexion, données locales gardées). Le serveur refuse aussi (409) une écriture annoncée pour un autre compte.

## Résumé pour Johan OS

`GET /api/summary` avec l'en-tête `x-summary-key`. Lecture seule, budget du propriétaire uniquement, `Cache-Control: no-store`.

- `SUMMARY_KEY` : 32 caractères au moins et différente de tout mot de passe, sinon la route répond 404. Générer une clé :
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
- Réponse : `month` (AAAA-MM à Paris), `currency`, `incomePlanned`, `spentThisMonth`, `remaining`, `accountsTotal`, `accounts` (`name`, `balance`), `goals` (`name`, `target`, `saved`, `percent`), `updatedAt`. Aucune opération ni note.
- Calcul (comme l'écran Budget en mode réel) : `incomePlanned` = somme des revenus prévus ; `spentThisMonth` = sorties du mois courant hors catégories « Épargne & invest » ; `remaining` = `incomePlanned - spentThisMonth` (les revenus ponctuels ne sont pas comptés) ; `percent` borné entre 0 et 100.

## Tests

`npm test` (node:test, faux stockage en mémoire, aucune base réelle).

## Mise en ligne (à faire par Johan)

1. Dans Vercel, Settings, Environment Variables (Production) : créer `APP_USERS` avec `johan:<ton mot de passe actuel>` en premier (si ton mot de passe actuel fait moins de 12 caractères, choisis-en un nouveau et mets-le à jour dans l'app et dans le raccourci Apple Pay), puis les autres personnes. Créer `SUMMARY_KEY`. `APP_OWNER` est facultative.
2. Ensuite seulement, fusionner la branche `comptes-separes` dans `main` : le déploiement prend les nouvelles variables.
3. Vérifier : sur ton téléphone, Réglages affiche « Connecté en tant que johan » et ton budget est intact.

Retour arrière : annuler la fusion sur `main` (git revert) ; l'ancien code relit `APP_PASSWORD` et la clé `budget-v2`, intactes. Supprimer `APP_USERS` suffit aussi à revenir au mot de passe unique avec le nouveau code. Les clés `budget-v2:<nom>` restent dans la table sans gêner.

## Déploiement

Hébergée sur Vercel, connectée à ce repo : chaque `git push` sur `main` redéploie automatiquement.
