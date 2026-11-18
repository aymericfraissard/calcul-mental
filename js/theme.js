/* =========================================================
   theme.js — Thème clair / sombre
   ---------------------------------------------------------
   Chargé dans le <head> pour appliquer le thème avant le
   premier affichage (pas de flash). Par défaut, suit
   prefers-color-scheme ; un choix manuel est mémorisé.
   Le thème se traduit uniquement par l'attribut
   data-theme sur <html> (les couleurs sont des variables CSS).
   Dépend de : Store (storage.js).
   ========================================================= */

const Theme = (function () {
  'use strict';

  const root = document.documentElement;
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  let listener = null;

  function systemTheme() {
    return media && media.matches ? 'dark' : 'light';
  }

  function current() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    if (listener) listener(theme);
  }

  /** Bascule clair ↔ sombre et mémorise le choix. */
  function toggle() {
    const next = current() === 'dark' ? 'light' : 'dark';
    Store.saveTheme(next);
    apply(next);
    return next;
  }

  /** Le thème système a changé : on le suit tant que l'utilisateur n'a rien choisi. */
  function onSystemChange() {
    if (!Store.loadTheme()) apply(systemTheme());
  }

  /** Fonction appelée à chaque changement de thème (mise à jour du bouton). */
  function setListener(callback) {
    listener = callback;
  }

  apply(Store.loadTheme() || systemTheme());
  if (media) {
    if (media.addEventListener) media.addEventListener('change', onSystemChange);
    else if (media.addListener) media.addListener(onSystemChange);
  }

  return { toggle: toggle, current: current, setListener: setListener };
})();
