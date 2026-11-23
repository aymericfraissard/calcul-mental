# Calcul mental

Application web d'entraînement au calcul mental, en HTML / CSS / JavaScript pur : aucun framework, aucune dépendance, aucun build.

## Lancer

Double-cliquez sur `index.html`. L'application fonctionne directement en `file://`, sans serveur.

Pour vérifier le générateur de questions, le barème et les statistiques, ouvrez `tests.html` de la même façon.

## Fonctionnalités

- **Configuration** : opérations (+ − × ÷, mode mixte si plusieurs sont cochées), difficulté (Facile / Moyen / Difficile), type de partie (série de 10 / 20 / 50 questions, ou survie à 3 erreurs). La dernière configuration utilisée est mémorisée.
- **Pas de temps imparti** : on prend le temps qu'il faut. Un chronomètre discret mesure chaque réponse en arrière-plan (rien ne s'affiche pendant la question) et se met en pause pendant la confirmation d'abandon.
- **Note de rapidité sur 20** : chaque bonne réponse rapporte des points selon le temps mis (barème ci-dessous). La note d'une partie est la moyenne des points de ses bonnes réponses. Après chaque réponse juste, le temps et le palier s'affichent : « Juste ! 2,4 s · Réflexe ».
- **Aide intégrée** : sous chaque réglage, un petit « ? » se déplie au survol de la souris et explique concrètement chaque option, avec des exemples. Sur écran tactile, on le touche pour l'ouvrir ou le fermer. Au clavier, Entrée l'ouvre et Échap le referme.
- **Jeu** : calcul en grand, saisie au clavier validée avec Entrée, feedback juste / faux annoncé aussi aux lecteurs d'écran, score, série en cours, vies en survie. Échap ou « Abandonner » ouvre une confirmation et met la partie en pause.
- **Résultats** : score, pourcentage, temps de réponse moyen, note de rapidité, meilleure série, répartition des bonnes réponses par palier, « Nouveau record ! », liste des questions ratées, Rejouer.
- **Onglet Profil** (en haut de la page) : toutes les statistiques, filtrables par difficulté et par opération.
  - chiffres clés : parties, questions, réussite, temps moyen, note de rapidité, meilleure série, temps d'entraînement, avec une flèche de progression (10 dernières parties comparées aux 10 précédentes) ;
  - courbes d'évolution partie après partie (taux de réussite, temps moyen, note de rapidité), avec la valeur de chaque partie et la moyenne sur 5 parties ;
  - activité des 30 derniers jours (questions par jour) ;
  - détail par opération, répartition des temps par palier, records par configuration et 20 dernières parties ;
  - au survol (ou au toucher) des graphiques, une info-bulle donne les valeurs exactes ; au clavier, Tab puis les flèches gauche / droite ; chaque graphique a aussi une vue tableau.
- **Thème clair / sombre** : suit le système par défaut, le choix manuel est mémorisé. Les graphiques suivent le thème.
- **Sans stockage** : si `localStorage` est indisponible, l'application fonctionne quand même, mais rien n'est conservé après la fermeture de la page.

## Barème de rapidité

Le même pour toutes les difficultés. Les seuils sont inclus (3,0 s est un Réflexe).

| Temps de la bonne réponse | Palier | Points |
|---|---|---|
| 3 s ou moins | Réflexe | 20 |
| 3 à 5 s | Rapide | 16 |
| 5 à 10 s | Standard | 12 |
| 10 à 15 s | Posé | 8 |
| 15 à 30 s | Lent | 4 |
| plus de 30 s | Très lent | 0 |

Une réponse fausse ne rapporte aucun point : elle compte dans le pourcentage de réussite, pas dans la note de rapidité.

## Données enregistrées

Chaque partie terminée est enregistrée dans `localStorage` (clé `calcul-mental:games`, 2000 parties au plus) avec son détail par opération : nombre de questions, bonnes réponses, temps cumulé, points et paliers. L'historique, les records et le profil sont tous calculés à partir de ces parties. Les parties abandonnées ne sont pas enregistrées.

Les parties de l'ancienne version (historique et records) sont reprises automatiquement à la première ouverture. Leur score est conservé, mais leur temps et leur note de rapidité restent inconnus.

## Structure des fichiers

```
calcul-mental/
├── index.html        Page unique : les 4 écrans (accueil, profil, jeu, résultats) et la boîte de confirmation
├── tests.html        Tests du générateur (1000 questions par opération × difficulté), du barème et des statistiques
├── README.md
├── css/
│   └── style.css     Charte noir & blanc, thème sombre, graphiques, responsive (900 px / 600 px)
└── js/
    ├── storage.js    Store : parties, configuration et thème dans localStorage (try/catch, repli en mémoire, reprise de l'ancien format)
    ├── theme.js      Theme : bascule clair / sombre (chargé dans le <head>)
    ├── generator.js  Generator + generateQuestion(operations, difficulty)
    ├── stats.js      Stats : barème de rapidité, note sur 20, filtres, agrégats, records (fonctions pures)
    ├── timer.js      Timer : chronomètre discret (start / pause / resume / stop / elapsed)
    ├── ui.js         Ui : formatage français (durées, pourcentages, dates, libellés) et petits outils DOM
    ├── charts.js     Charts : courbes et colonnes en SVG, info-bulles, clavier, redimensionnement
    ├── profile.js    Profile : rendu de l'onglet Profil
    └── app.js        Contrôleur : écrans, onglets, déroulement d'une partie, état dans `state`
```

Les scripts sont chargés avec des `<script src>` classiques (pas de modules ES). `storage.js` et `theme.js` sont dans le `<head>`, les autres en fin de page dans l'ordre ci-dessus.

## Règles de génération

| Difficulté | Addition / Soustraction | Multiplication | Division |
|---|---|---|---|
| Facile | 1 à 20 | table de 1 à 5 × 1 à 10 | diviseur 1–5, résultat 1–5 |
| Moyen | 10 à 100 | 2 à 10 × 2 à 10 | diviseur 2–10, résultat 1–10 |
| Difficile | 50 à 999 (résultat négatif possible) | 2 à 20 × 2 à 20 | diviseur 2–15, résultat 1–20 |

Les divisions tombent toujours juste (`a = b × q`), la soustraction n'est jamais négative en Facile et Moyen, et le même calcul n'est jamais proposé deux fois de suite.
