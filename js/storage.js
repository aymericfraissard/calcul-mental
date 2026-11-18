/* =========================================================
   storage.js — Persistance locale (configuration, thème,
   historique, records)
   ---------------------------------------------------------
   Toutes les lectures / écritures passent par ce fichier.
   localStorage est encapsulé dans des try/catch : s'il est
   indisponible (navigation privée, quota, file:// bloqué…),
   les données sont gardées en mémoire le temps de la session
   et l'application continue de fonctionner.
   ========================================================= */

const Store = (function () {
  'use strict';

  const PREFIX = 'calcul-mental:';
  const HISTORY_LIMIT = 20;

  /** Cache en écriture : sert aussi de repli si localStorage est indisponible. */
  const memory = {};
  const backend = detectBackend();

  /* ---------- Accès bas niveau ---------- */

  /** Renvoie localStorage s'il est réellement utilisable, sinon null. */
  function detectBackend() {
    try {
      const storage = window.localStorage;
      const probe = PREFIX + '__test__';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      return storage;
    } catch (error) {
      return null;
    }
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  /** Lit la valeur brute (chaîne JSON) : d'abord la mémoire, puis localStorage. */
  function readRaw(name) {
    if (hasOwn(memory, name)) return memory[name];
    if (!backend) return null;
    try {
      return backend.getItem(PREFIX + name);
    } catch (error) {
      return null;
    }
  }

  /** Lit et décode une valeur, ou renvoie `fallback` si absente / illisible. */
  function read(name, fallback) {
    const raw = readRaw(name);
    if (raw === null || raw === undefined) return fallback;
    try {
      const value = JSON.parse(raw);
      return value === null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  /** Écrit une valeur. Renvoie true si elle a bien été persistée. */
  function write(name, value) {
    const raw = JSON.stringify(value);
    memory[name] = raw;
    if (!backend) return false;
    try {
      backend.setItem(PREFIX + name, raw);
      return true;
    } catch (error) {
      return false;
    }
  }

  function remove(name) {
    delete memory[name];
    if (!backend) return;
    try {
      backend.removeItem(PREFIX + name);
    } catch (error) {
      /* rien à faire : la valeur en mémoire est déjà supprimée */
    }
  }

  /* ---------- Configuration & thème ---------- */

  function loadConfig() {
    return read('config', null);
  }

  function saveConfig(config) {
    write('config', config);
  }

  /** Renvoie 'light', 'dark' ou null (aucun choix mémorisé). */
  function loadTheme() {
    const theme = read('theme', null);
    return theme === 'light' || theme === 'dark' ? theme : null;
  }

  function saveTheme(theme) {
    write('theme', theme);
  }

  /* ---------- Historique ---------- */

  /** Les 20 dernières parties, de la plus récente à la plus ancienne. */
  function getHistory() {
    const history = read('history', []);
    return Array.isArray(history) ? history : [];
  }

  function addHistory(entry) {
    const history = [entry].concat(getHistory()).slice(0, HISTORY_LIMIT);
    write('history', history);
    return history;
  }

  /** Efface l'historique ET les records. */
  function clearHistory() {
    remove('history');
    remove('records');
  }

  /* ---------- Records par configuration ---------- */

  /**
   * Clé unique d'une configuration : opérations + difficulté + temps + type de partie
   * (le nombre de questions fait partie du type pour une série).
   */
  function configKey(config) {
    const mode = config.mode === 'serie' ? 'serie-' + config.count : 'survie';
    return [
      'ops=' + config.operations.slice().sort().join('+'),
      'diff=' + config.difficulty,
      'time=' + config.time,
      'mode=' + mode
    ].join('|');
  }

  function getRecords() {
    const records = read('records', {});
    return records && typeof records === 'object' && !Array.isArray(records) ? records : {};
  }

  function getRecord(key) {
    const records = getRecords();
    return hasOwn(records, key) ? records[key] : null;
  }

  /**
   * Un résultat bat le record s'il a plus de bonnes réponses,
   * ou autant mais avec un temps de réponse moyen plus court.
   */
  function isBetter(result, previous) {
    if (!previous) return result.correct > 0;
    if (result.correct !== previous.correct) return result.correct > previous.correct;
    return result.avgMs !== null && typeof previous.avgMs === 'number' && result.avgMs < previous.avgMs;
  }

  /** Enregistre le résultat s'il bat le record. Renvoie true si c'est un nouveau record. */
  function saveRecord(key, result) {
    const records = getRecords();
    const previous = hasOwn(records, key) ? records[key] : null;
    if (!isBetter(result, previous)) return false;
    records[key] = result;
    write('records', records);
    return true;
  }

  /** true si les données survivront à la fermeture de la page. */
  function isPersistent() {
    return backend !== null;
  }

  return {
    loadConfig: loadConfig,
    saveConfig: saveConfig,
    loadTheme: loadTheme,
    saveTheme: saveTheme,
    getHistory: getHistory,
    addHistory: addHistory,
    clearHistory: clearHistory,
    configKey: configKey,
    getRecords: getRecords,
    getRecord: getRecord,
    saveRecord: saveRecord,
    isPersistent: isPersistent
  };
})();
