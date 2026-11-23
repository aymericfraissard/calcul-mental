/* =========================================================
   stats.js — Barème de rapidité et calcul des statistiques
   ---------------------------------------------------------
   Fonctions pures, sans accès au DOM ni au stockage : elles
   reçoivent des parties enregistrées et renvoient des chiffres.
   Une partie enregistrée (« game ») a la forme :
     { v, date, operations, difficulty, mode, count,
       correct, total, ms, bestStreak,
       ops: { add: { n, c, ms, pts, tiers: [...] }, ... } }
   où, par opération : n = questions, c = bonnes réponses,
   ms = temps total de réponse, pts = points de rapidité des
   bonnes réponses, tiers = nombre de bonnes réponses par palier.
   Les parties importées d'une ancienne version ont ms, ops et
   bestStreak à null : elles comptent seulement pour la réussite.
   ========================================================= */

const Stats = (function () {
  'use strict';

  const OPERATIONS = ['add', 'sub', 'mul', 'div'];

  /**
   * Barème de rapidité : chaque bonne réponse rapporte des points
   * selon le temps mis pour répondre (seuils inclus).
   */
  const TIERS = [
    { maxMs: 3000, label: 'Réflexe', limit: '3 s ou moins', points: 20 },
    { maxMs: 5000, label: 'Rapide', limit: '3 à 5 s', points: 16 },
    { maxMs: 10000, label: 'Standard', limit: '5 à 10 s', points: 12 },
    { maxMs: 15000, label: 'Posé', limit: '10 à 15 s', points: 8 },
    { maxMs: 30000, label: 'Lent', limit: '15 à 30 s', points: 4 },
    { maxMs: Infinity, label: 'Très lent', limit: 'plus de 30 s', points: 0 }
  ];

  const NOTE_MAX = 20;

  /* ---------- Barème ---------- */

  /**
   * Palier d'un temps de réponse. Le temps est d'abord arrondi au dixième
   * de seconde, comme il est affiché : « 3,0 s » est toujours un Réflexe.
   */
  function tierIndex(ms) {
    const rounded = Math.round(ms / 100) * 100;
    for (let i = 0; i < TIERS.length; i++) {
      if (rounded <= TIERS[i].maxMs) return i;
    }
    return TIERS.length - 1;
  }

  function tierFor(ms) {
    return TIERS[tierIndex(ms)];
  }

  /** Note de rapidité sur 20 : moyenne des points des bonnes réponses. */
  function speedNote(points, correct) {
    return correct > 0 ? points / correct : null;
  }

  /* ---------- Construction d'une partie enregistrée ---------- */

  function emptyCounters() {
    return { n: 0, c: 0, ms: 0, pts: 0, tiers: TIERS.map(function () { return 0; }) };
  }

  /** Ajoute une réponse aux compteurs d'une opération. */
  function addAnswer(counters, ms, isCorrect) {
    counters.n += 1;
    counters.ms += Math.round(ms);
    if (!isCorrect) return;
    const index = tierIndex(ms);
    counters.c += 1;
    counters.pts += TIERS[index].points;
    counters.tiers[index] += 1;
  }

  /**
   * Résume une partie terminée pour l'enregistrer.
   * @param {object} config   { operations, difficulty, mode, count }
   * @param {Array}  entries  [{ question: { op }, ms, isCorrect }]
   */
  function buildGameRecord(config, entries, bestStreak, dateIso) {
    const ops = {};
    entries.forEach(function (entry) {
      const op = entry.question.op;
      if (!ops[op]) ops[op] = emptyCounters();
      addAnswer(ops[op], entry.ms, entry.isCorrect);
    });
    const totals = sumCounters(objectValues(ops));
    return {
      v: 2,
      date: dateIso,
      operations: config.operations.slice(),
      difficulty: config.difficulty,
      mode: config.mode,
      count: config.count,
      correct: totals.c,
      total: totals.n,
      ms: totals.ms,
      bestStreak: bestStreak,
      ops: ops
    };
  }

  function sumCounters(list) {
    return list.reduce(function (sum, item) {
      sum.n += item.n;
      sum.c += item.c;
      sum.ms += item.ms;
      sum.pts += item.pts;
      item.tiers.forEach(function (count, i) { sum.tiers[i] += count; });
      return sum;
    }, emptyCounters());
  }

  /* ---------- Filtrage ---------- */

  /**
   * Chiffres d'une partie pour une opération donnée ('all' = toutes).
   * Renvoie null si la partie ne contient pas cette opération.
   */
  function sliceOf(game, op) {
    if (!game.ops) {
      // Ancienne partie : seul le score global est connu
      const covers = op === 'all' || (game.operations.length === 1 && game.operations[0] === op);
      return covers ? { n: game.total, c: game.correct, ms: null, pts: null, tiers: null } : null;
    }
    if (op === 'all') return sumCounters(objectValues(game.ops));
    if (!game.ops[op]) return null;
    const counters = game.ops[op];
    return { n: counters.n, c: counters.c, ms: counters.ms, pts: counters.pts, tiers: counters.tiers.slice() };
  }

  /** Totaux d'une partie (toutes opérations) : { n, c, ms, pts, tiers }. */
  function totalsOf(game) {
    return sliceOf(game, 'all');
  }

  /**
   * Applique les filtres { difficulty, op } ('all' = pas de filtre).
   * Renvoie, dans l'ordre chronologique, une « tranche » par partie retenue :
   * { game, n, c, ms, pts, tiers }.
   */
  function select(games, filter) {
    const result = [];
    games.forEach(function (game) {
      if (filter.difficulty !== 'all' && game.difficulty !== filter.difficulty) return;
      const slice = sliceOf(game, filter.op);
      if (!slice || slice.n === 0) return;
      slice.game = game;
      result.push(slice);
    });
    return result;
  }

  /* ---------- Agrégats ---------- */

  /** Chiffres globaux d'un ensemble de tranches. */
  function summarize(slices) {
    let questions = 0;
    let correct = 0;
    let timedQuestions = 0;
    let totalMs = 0;
    let scoredCorrect = 0;
    let points = 0;
    let bestStreak = null;
    slices.forEach(function (slice) {
      questions += slice.n;
      correct += slice.c;
      if (slice.ms !== null) {
        timedQuestions += slice.n;
        totalMs += slice.ms;
      }
      if (slice.pts !== null) {
        scoredCorrect += slice.c;
        points += slice.pts;
      }
      if (typeof slice.game.bestStreak === 'number') {
        bestStreak = Math.max(bestStreak || 0, slice.game.bestStreak);
      }
    });
    return {
      games: slices.length,
      questions: questions,
      correct: correct,
      rate: questions > 0 ? correct / questions : null,
      avgMs: timedQuestions > 0 ? totalMs / timedQuestions : null,
      note: speedNote(points, scoredCorrect),
      bestStreak: bestStreak,
      totalMs: totalMs
    };
  }

  /** Valeur d'une tranche pour un indicateur d'évolution (null = inconnue). */
  const METRICS = {
    rate: function (slice) { return slice.n > 0 ? (slice.c / slice.n) * 100 : null; },
    time: function (slice) { return slice.ms !== null && slice.n > 0 ? slice.ms / slice.n / 1000 : null; },
    note: function (slice) { return slice.pts !== null ? speedNote(slice.pts, slice.c) : null; }
  };

  /** Une valeur par partie, de la plus ancienne à la plus récente. */
  function evolution(slices, metric) {
    const read = METRICS[metric];
    return slices.map(function (slice, i) {
      return { index: i + 1, game: slice.game, value: read(slice) };
    });
  }

  /** Moyenne glissante sur les `size` dernières valeurs connues (null ignorés). */
  function movingAverage(values, size) {
    return values.map(function (value, i) {
      const window = values.slice(Math.max(0, i - size + 1), i + 1).filter(function (v) { return v !== null; });
      if (value === null || window.length === 0) return null;
      return window.reduce(function (sum, v) { return sum + v; }, 0) / window.length;
    });
  }

  /** Questions et parties par jour (heure locale) sur les `days` derniers jours. */
  function activity(slices, days, now) {
    const result = [];
    const byKey = {};
    for (let back = days - 1; back >= 0; back--) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
      const item = { key: dayKey(date), date: date, questions: 0, games: 0 };
      byKey[item.key] = item;
      result.push(item);
    }
    slices.forEach(function (slice) {
      const item = byKey[dayKey(new Date(slice.game.date))];
      if (!item) return;
      item.questions += slice.n;
      item.games += 1;
    });
    return result;
  }

  function dayKey(date) {
    const pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  /** Chiffres par opération (respecte les filtres). */
  function byOperation(games, filter) {
    return OPERATIONS
      .filter(function (op) { return filter.op === 'all' || filter.op === op; })
      .map(function (op) {
        const summary = summarize(select(games, { difficulty: filter.difficulty, op: op }));
        summary.op = op;
        return summary;
      })
      .filter(function (row) { return row.questions > 0; });
  }

  /** Nombre de bonnes réponses par palier du barème. */
  function tierCounts(slices) {
    const counts = TIERS.map(function () { return 0; });
    slices.forEach(function (slice) {
      if (!slice.tiers) return;
      slice.tiers.forEach(function (count, i) { counts[i] += count; });
    });
    return counts;
  }

  /* ---------- Records ---------- */

  /** Clé d'une configuration : opérations + difficulté + type de partie. */
  function configKey(config) {
    const mode = config.mode === 'serie' ? 'serie-' + config.count : 'survie';
    return [
      'ops=' + config.operations.slice().sort().join('+'),
      'diff=' + config.difficulty,
      'mode=' + mode
    ].join('|');
  }

  function averageMs(game) {
    return typeof game.ms === 'number' && game.total > 0 ? game.ms / game.total : null;
  }

  /** Plus de bonnes réponses, ou autant mais un temps moyen plus court. */
  function isBetter(game, best) {
    if (!best) return game.correct > 0;
    if (game.correct !== best.correct) return game.correct > best.correct;
    const mine = averageMs(game);
    const theirs = averageMs(best);
    return mine !== null && theirs !== null && mine < theirs;
  }

  /** Meilleure partie pour une configuration, ou null. */
  function bestGame(games, key) {
    let best = null;
    games.forEach(function (game) {
      if (configKey(game) === key && isBetter(game, best)) best = game;
    });
    return best;
  }

  /** Le record de chaque configuration jouée, du plus récent au plus ancien. */
  function records(games) {
    const best = {};
    games.forEach(function (game) {
      const key = configKey(game);
      if (isBetter(game, best[key] || null)) best[key] = game;
    });
    return objectValues(best).sort(function (a, b) { return b.date.localeCompare(a.date); });
  }

  function objectValues(object) {
    return Object.keys(object).map(function (key) { return object[key]; });
  }

  return {
    OPERATIONS: OPERATIONS,
    TIERS: TIERS,
    NOTE_MAX: NOTE_MAX,
    tierIndex: tierIndex,
    tierFor: tierFor,
    speedNote: speedNote,
    buildGameRecord: buildGameRecord,
    totalsOf: totalsOf,
    select: select,
    summarize: summarize,
    evolution: evolution,
    movingAverage: movingAverage,
    activity: activity,
    dayKey: dayKey,
    byOperation: byOperation,
    tierCounts: tierCounts,
    configKey: configKey,
    averageMs: averageMs,
    isBetter: isBetter,
    bestGame: bestGame,
    records: records
  };
})();
