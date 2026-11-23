/* =========================================================
   ui.js — Formatage des textes et petits outils DOM
   ---------------------------------------------------------
   Partagé par app.js, profile.js et charts.js.
   Dépend de : Generator (libellés des opérations).
   ========================================================= */

const Ui = (function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const DIFFICULTY_LABELS = { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile' };
  const NBSP = ' ';

  const ONE_DECIMAL = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const INTEGER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  const UP_TO_ONE_DECIMAL = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

  /* ---------- Nombres ---------- */

  /** Affiche les nombres négatifs avec le vrai signe moins (−). */
  function formatNumber(value) {
    return value < 0 ? '−' + Math.abs(value) : String(value);
  }

  /** Entier avec séparateur de milliers : « 1 284 ». */
  function formatInteger(value) {
    return INTEGER.format(value);
  }

  function formatDecimal(value) {
    return ONE_DECIMAL.format(value);
  }

  /** Une décimale seulement si nécessaire : « 5 », « 2,5 ». */
  function formatCompact(value) {
    return UP_TO_ONE_DECIMAL.format(value);
  }

  function formatOperation(question) {
    return formatNumber(question.a) + ' ' + question.symbol + ' ' + formatNumber(question.b);
  }

  /** Durée en secondes au dixième : « 2,4 s ». */
  function formatSeconds(ms) {
    return ONE_DECIMAL.format(ms / 1000) + NBSP + 's';
  }

  /** Ratio (0 à 1) en pourcentage entier : « 72 % ». */
  function formatPercent(ratio) {
    return Math.round(ratio * 100) + NBSP + '%';
  }

  /** Note sur 20 au dixième : « 14,4 ». */
  function formatNote(note) {
    return ONE_DECIMAL.format(note);
  }

  /** Durée longue : « 45 s », « 12 min », « 1 h 05 ». */
  function formatTotalTime(ms) {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return seconds + NBSP + 's';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return minutes + NBSP + 'min';
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return hours + NBSP + 'h' + NBSP + (rest < 10 ? '0' : '') + rest;
  }

  /* ---------- Dates ---------- */

  function formatDate(iso) {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '—';
    const day = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return day + ' à ' + time;
  }

  /** « 16 nov. » */
  function formatShortDay(date) {
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  /** « lundi 16 novembre » */
  function formatLongDay(date) {
    return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  /* ---------- Libellés ---------- */

  function operationsLabel(operations) {
    if (operations.length === 1) return Generator.OPERATIONS[operations[0]].label;
    return 'Mixte ' + operations.map(function (op) { return Generator.OPERATIONS[op].symbol; }).join(' ');
  }

  /** Exemple : « Mixte + × · Moyen · Série de 20 ». */
  function formatConfigLabel(config) {
    const mode = config.mode === 'serie' ? 'Série de ' + config.count : 'Survie';
    return [operationsLabel(config.operations), DIFFICULTY_LABELS[config.difficulty], mode].join(' · ');
  }

  function formatRecordScore(game) {
    return game.mode === 'survie'
      ? pluralize(game.correct, 'bonne réponse', 'bonnes réponses')
      : game.correct + ' / ' + game.total;
  }

  /** Accord en français : 0 et 1 au singulier. */
  function pluralize(count, singular, plural) {
    return formatInteger(count) + ' ' + (Math.abs(count) > 1 ? plural : singular);
  }

  /* ---------- DOM ---------- */

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  /** Élément SVG avec ses attributs. */
  function createSvg(tag, attributes) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.keys(attributes || {}).forEach(function (name) {
      element.setAttribute(name, String(attributes[name]));
    });
    return element;
  }

  function replaceChildren(parent, children) {
    while (parent.firstChild) parent.removeChild(parent.firstChild);
    children.forEach(function (child) { parent.appendChild(child); });
  }

  return {
    DIFFICULTY_LABELS: DIFFICULTY_LABELS,
    formatNumber: formatNumber,
    formatInteger: formatInteger,
    formatDecimal: formatDecimal,
    formatCompact: formatCompact,
    formatOperation: formatOperation,
    formatSeconds: formatSeconds,
    formatPercent: formatPercent,
    formatNote: formatNote,
    formatTotalTime: formatTotalTime,
    formatDate: formatDate,
    formatShortDay: formatShortDay,
    formatLongDay: formatLongDay,
    operationsLabel: operationsLabel,
    formatConfigLabel: formatConfigLabel,
    formatRecordScore: formatRecordScore,
    pluralize: pluralize,
    createElement: createElement,
    createSvg: createSvg,
    replaceChildren: replaceChildren
  };
})();
