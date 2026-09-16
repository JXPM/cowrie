# Mon budget — app web

Application de budget mensuel, 100 % statique (un seul fichier `index.html`).

## Déployer sur Vercel

### Option A — le plus rapide (sans GitHub)
1. Installe la CLI : `npm i -g vercel`
2. Dans le dossier du projet : `vercel`
3. Suis les questions → ton app est en ligne.
   (Redéployer plus tard : `vercel --prod`)

Ou, sans CLI : dashboard Vercel → **Add New… → Project → Deploy** en glissant le dossier.

### Option B — via GitHub (déploiement auto à chaque push)
```bash
git init
git add .
git commit -m "Budget app"
git branch -M main
git remote add origin git@github.com:<ton-user>/<ton-repo>.git
git push -u origin main
```
Puis sur Vercel : **Add New… → Project → Import** ton repo. Chaque `git push` redéploie tout seul.

Aucune config nécessaire (`vercel.json` inutile pour un site statique).

## ⚠️ Important — la sauvegarde
La synchro privée entre appareils est une fonctionnalité **de l'artefact Claude uniquement**.
Hébergée sur ton domaine, l'app bascule automatiquement sur le stockage local du navigateur
(`localStorage`) : elle marche et enregistre, mais **seulement sur ce navigateur-là**,
pas synchronisé entre appareils.

Pour une vraie persistance sur ton hébergement → petit backend (Supabase s'intègre
parfaitement à Vercel, offre gratuite). Je peux te le câbler si tu veux.
