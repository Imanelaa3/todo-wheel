# 🎡 Roue des tâches

Un petit site pour remplir sa todo liste, puis faire tourner une roue qui choisit au hasard la prochaine tâche à faire.

## Fonctionnalités

- Ajouter, cocher et supprimer des tâches
- Les tâches non terminées apparaissent sur la roue
- La roue tire une tâche au hasard (chaque tâche a la même chance)
- Les tâches sont sauvegardées dans le navigateur (`localStorage`) : elles restent après un rechargement, mais seulement sur cet appareil et ce navigateur

## Lancer le site en local

Aucune installation nécessaire : ouvre `index.html` dans ton navigateur.

## Mettre le site en ligne (GitHub Pages)

1. Fusionne ce code dans la branche `main`.
2. Sur GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
3. Le workflow `.github/workflows/pages.yml` publie le site à chaque push sur `main`.

## Structure

- `index.html` — la page
- `style.css` — la mise en forme
- `app.js` — la logique (liste, sauvegarde, roue)
