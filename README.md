# Calcul mental

Application web d'entraînement au calcul mental, en HTML / CSS / JavaScript pur : aucun framework, aucune dépendance, aucun build.

## Lancer

Double-cliquez sur `index.html`. L'application fonctionne directement en `file://`, sans serveur.

Pour vérifier le générateur de questions, ouvrez `tests.html` de la même façon.

## Fonctionnalités

- **Configuration** : opérations (+ − × ÷, mode mixte si plusieurs sont cochées), difficulté (Facile / Moyen / Difficile), temps par question (3 s à 30 s, ou illimité), type de partie (série de 10 / 20 / 50 questions, ou survie à 3 erreurs). La dernière configuration utilisée est mémorisée.
- **Jeu** : calcul en grand, saisie au clavier validée avec Entrée, barre de temps fluide (`requestAnimationFrame`) qui passe à l'orange sous 30 % et au rouge sous 15 %, feedback juste / faux annoncé aussi aux lecteurs d'écran, score, série en cours, vies en survie. Échap ou « Abandonner » ouvre une confirmation et met la partie en pause.
- **Résultats** : score, pourcentage, temps de réponse moyen, meilleure série, « Nouveau record ! », liste des questions ratées, Rejouer.
- **Historique & records** : records par configuration et 20 dernières parties, avec un bouton pour tout effacer.
- **Thème clair / sombre** : suit le système par défaut, le choix manuel est mémorisé.
- **Sans stockage** : si `localStorage` est indisponible, l'application fonctionne quand même, mais rien n'est conservé après la fermeture de la page.

## Structure des fichiers

```
calcul-mental/
├── index.html        Page unique : les 4 écrans et la boîte de confirmation
├── tests.html        Tests du générateur (1000 questions par opération × difficulté)
├── README.md
├── css/
│   └── style.css     Charte noir & blanc, thème sombre, responsive (900 px / 600 px)
└── js/
    ├── storage.js    Store : localStorage protégé par try/catch, avec repli en mémoire
    ├── theme.js      Theme : bascule clair / sombre (chargé dans le <head>)
    ├── generator.js  Generator + generateQuestion(operations, difficulty)
    ├── timer.js      Timer : compte à rebours rAF (start / pause / resume / stop)
    └── app.js        Contrôleur : écrans, déroulement d'une partie, état dans `state`
```

Les scripts sont chargés avec des `<script src>` classiques (pas de modules ES), dans l'ordre ci-dessus.

## Règles de génération

| Difficulté | Addition / Soustraction | Multiplication | Division |
|---|---|---|---|
| Facile | 1 à 20 | table de 1 à 5 × 1 à 10 | diviseur 1–5, résultat 1–5 |
| Moyen | 10 à 100 | 2 à 10 × 2 à 10 | diviseur 2–10, résultat 1–10 |
| Difficile | 50 à 999 (résultat négatif possible) | 2 à 20 × 2 à 20 | diviseur 2–15, résultat 1–20 |

Les divisions tombent toujours juste (`a = b × q`), la soustraction n'est jamais négative en Facile et Moyen, et le même calcul n'est jamais proposé deux fois de suite.
