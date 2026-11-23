/* =========================================================
   storage.js — Persistance locale (configuration, thème,
   parties jouées)
   ---------------------------------------------------------
   Toutes les lectures / écritures passent par ce fichier.
   localStorage est encapsulé dans des try/catch : s'il est
   indisponible (navigation privée, quota, file:// bloqué…),
   les données sont gardées en mémoire le temps de la session
   et l'application continue de fonctionner.

   Chaque partie terminée est enregistrée en entier (voir
   Stats.buildGameRecord) : l'historique, les records et les
   statistiques du profil en sont tous déduits.
   ========================================================= */

const Store = (function () {
  'use strict';

  const PREFIX = 'calcul-mental:';
  const GAMES_LIMIT = 2000; // environ 600 Ko au maximum
  const OPERATIONS = ['add', 'sub', 'mul', 'div'];
  const DIFFICULTIES = ['facile', 'moyen', 'difficile'];

  /** Cache en écriture : sert aussi de repli si localStorage est indisponible. */
  const memory = {};
  const backend = detectBackend();
  let gamesCache = null; // parties décodées, de la plus ancienne à la plus récente

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

  /* ---------- Parties ---------- */

  /** Toutes les parties, de la plus ancienne à la plus récente (copie). */
  function getGames() {
    if (gamesCache === null) gamesCache = loadGames();
    return gamesCache.slice();
  }

  /** Ajoute une partie terminée. Renvoie true si elle a bien été persistée. */
  function addGame(game) {
    const games = getGames();
    games.push(game);
    gamesCache = games.slice(-GAMES_LIMIT);
    return write('games', gamesCache);
  }

  /** Efface toutes les parties (et donc l'historique, les records et le profil). */
  function clearGames() {
    gamesCache = [];
    remove('games');
    remove('history');
    remove('records');
  }

  function loadGames() {
    const stored = read('games', []);
    const games = (Array.isArray(stored) ? stored : []).filter(isValidGame);
    const legacy = readLegacyGames();
    if (legacy.length === 0) return games;
    // Première ouverture après la mise à jour : on reprend l'ancien historique
    const merged = mergeByDate(legacy, games).slice(-GAMES_LIMIT);
    if (write('games', merged)) {
      remove('history');
      remove('records');
    }
    return merged;
  }

  /** Une partie lisible : sinon elle est ignorée (stockage modifié à la main…). */
  function isValidGame(game) {
    return Boolean(game) && typeof game === 'object' &&
      typeof game.date === 'string' && !isNaN(Date.parse(game.date)) &&
      Array.isArray(game.operations) && game.operations.length > 0 &&
      game.operations.every(function (op) { return OPERATIONS.indexOf(op) !== -1; }) &&
      DIFFICULTIES.indexOf(game.difficulty) !== -1 &&
      (game.mode === 'survie' || (game.mode === 'serie' && isCount(game.count) && game.count > 0)) &&
      isCount(game.correct) && isCount(game.total) && game.correct <= game.total &&
      (game.ops === null || isValidOps(game.ops));
  }

  function isValidOps(ops) {
    if (!ops || typeof ops !== 'object') return false;
    return Object.keys(ops).every(function (op) {
      const counters = ops[op];
      return OPERATIONS.indexOf(op) !== -1 && counters && typeof counters === 'object' &&
        isCount(counters.n) && isCount(counters.c) && isCount(counters.ms) && isCount(counters.pts) &&
        Array.isArray(counters.tiers) && counters.tiers.every(isCount);
    });
  }

  function isCount(value) {
    return typeof value === 'number' && isFinite(value) && value >= 0;
  }

  /** Fusionne deux listes de parties, sans doublon, triées par date. */
  function mergeByDate(first, second) {
    const seen = {};
    return first.concat(second)
      .filter(function (game) {
        const id = game.date + '|' + game.operations.join('+') + '|' + game.difficulty;
        if (seen[id]) return false;
        seen[id] = true;
        return true;
      })
      .sort(function (a, b) { return a.date.localeCompare(b.date); });
  }

  /* ---------- Reprise de l'ancien format (historique + records) ---------- */

  /**
   * L'ancienne version gardait les 20 dernières parties et un record par
   * configuration, sans le détail par question. Ces parties sont reprises
   * avec le score seulement : temps et note de rapidité restent inconnus.
   */
  function readLegacyGames() {
    const history = read('history', []);
    const records = read('records', {});
    const entries = (Array.isArray(history) ? history : []).concat(
      records && typeof records === 'object' && !Array.isArray(records)
        ? Object.keys(records).map(function (key) { return records[key]; })
        : []
    );
    return entries.map(convertLegacyEntry).filter(isValidGame);
  }

  /** Exemple de clé : 'ops=add+mul|diff=moyen|time=10|mode=serie-20'. */
  function convertLegacyEntry(entry) {
    if (!entry || typeof entry !== 'object' || typeof entry.key !== 'string') return null;
    const parts = {};
    entry.key.split('|').forEach(function (part) {
      const index = part.indexOf('=');
      if (index > 0) parts[part.slice(0, index)] = part.slice(index + 1);
    });
    const mode = parts.mode || '';
    const isSerie = mode.indexOf('serie-') === 0;
    return {
      v: 1,
      date: entry.date,
      operations: (parts.ops || '').split('+').filter(Boolean)
        .sort(function (a, b) { return OPERATIONS.indexOf(a) - OPERATIONS.indexOf(b); }),
      difficulty: parts.diff,
      mode: isSerie ? 'serie' : (mode === 'survie' ? 'survie' : null),
      count: isSerie ? Number(mode.slice(6)) : null,
      correct: entry.correct,
      total: entry.total,
      ms: null,
      bestStreak: null,
      ops: null
    };
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
    getGames: getGames,
    addGame: addGame,
    clearGames: clearGames,
    isPersistent: isPersistent
  };
})();
