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
- Synchro entre appareils : dans Patrimoine → Réglages, entre le mot de passe de l'app (`APP_PASSWORD`). Le budget est stocké dans Neon sous la clé `budget-v2` via `/api/state2` (variables `DATABASE_URL` et `APP_PASSWORD`).

## Déploiement

Hébergée sur Vercel, connectée à ce repo : chaque `git push` sur `main` redéploie automatiquement.
