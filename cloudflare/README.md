# Worker du lecteur

Ce dossier contient le Worker `webtoontest`.

- Entree : `worker.js`
- Configuration : `wrangler.jsonc`
- Branche de production : `main`
- Repertoire Cloudflare Builds : `/cloudflare`
- Commande de deploiement : `npx wrangler deploy`

Le depot GitHub est la source du code. Les modifications poussees sur main declenchent le deploiement Cloudflare configure par le proprietaire.

Routes de test : `/diagnostic` et `/chapter/192`. Le lecteur sur GitHub Pages utilise la seconde pour obtenir les images dans leur ordre de lecture. Aucun telechargement hors connexion n'est implemente.
