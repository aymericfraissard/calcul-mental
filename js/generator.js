/* =========================================================
   generator.js — Génération des questions de calcul mental
   ---------------------------------------------------------
   Expose :
     - Generator.generateQuestion(operations, difficulty)
     - generateQuestion(operations, difficulty)  (raccourci global)
   Chaque appel renvoie un objet { a, b, op, symbol, answer }.
   Aucune dépendance au DOM : le fichier est testable seul.
   ========================================================= */

const Generator = (function () {
  'use strict';

  /** Opérations disponibles : symbole affiché, libellé, lecture vocale et calcul. */
  const OPERATIONS = {
    add: { symbol: '+', label: 'Addition', spoken: 'plus', compute: function (a, b) { return a + b; } },
    sub: { symbol: '−', label: 'Soustraction', spoken: 'moins', compute: function (a, b) { return a - b; } },
    mul: { symbol: '×', label: 'Multiplication', spoken: 'fois', compute: function (a, b) { return a * b; } },
    div: { symbol: '÷', label: 'Division', spoken: 'divisé par', compute: function (a, b) { return a / b; } }
  };

  /**
   * Règles par difficulté (toutes les bornes sont incluses).
   * - addSub      : bornes des deux nombres d'une addition / soustraction
   * - mulTable    : la « table » (un des deux facteurs)
   * - mulFactor   : l'autre facteur
   * - divDivisor  : diviseur (jamais 0)
   * - divQuotient : résultat de la division
   * - allowNegative : la soustraction peut-elle donner un résultat négatif ?
   */
  const RULES = {
    facile: {
      addSub: [1, 20],
      mulTable: [1, 5], mulFactor: [1, 10],
      divDivisor: [1, 5], divQuotient: [1, 5],
      allowNegative: false
    },
    moyen: {
      addSub: [10, 100],
      mulTable: [2, 10], mulFactor: [2, 10],
      divDivisor: [2, 10], divQuotient: [1, 10],
      allowNegative: false
    },
    difficile: {
      addSub: [50, 999],
      mulTable: [2, 20], mulFactor: [2, 20],
      divDivisor: [2, 15], divQuotient: [1, 20],
      allowNegative: true
    }
  };

  /** Nombre maximal de tirages pour éviter de reproposer le même calcul. */
  const MAX_ATTEMPTS = 50;

  /** Clé du dernier calcul proposé (pour éviter deux fois de suite le même). */
  let lastKey = null;

  /* ---------- Outils de tirage ---------- */

  /** Entier aléatoire dans [min, max] (bornes incluses). */
  function randomInt(range) {
    const min = range[0];
    const max = range[1];
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /** Élément aléatoire d'une liste. */
  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  /* ---------- Construction des opérandes par opération ---------- */

  const BUILDERS = {
    add: function (rules) {
      return { a: randomInt(rules.addSub), b: randomInt(rules.addSub) };
    },

    sub: function (rules) {
      let a = randomInt(rules.addSub);
      let b = randomInt(rules.addSub);
      // En Facile / Moyen, on place le plus grand nombre en premier : résultat ≥ 0
      if (!rules.allowNegative && a < b) {
        const tmp = a;
        a = b;
        b = tmp;
      }
      return { a: a, b: b };
    },

    mul: function (rules) {
      const table = randomInt(rules.mulTable);
      const factor = randomInt(rules.mulFactor);
      // La table n'est pas toujours affichée en premier
      return Math.random() < 0.5 ? { a: table, b: factor } : { a: factor, b: table };
    },

    div: function (rules) {
      // On tire le diviseur et le résultat, puis a = b × q : division toujours entière
      const divisor = randomInt(rules.divDivisor);
      const quotient = randomInt(rules.divQuotient);
      return { a: divisor * quotient, b: divisor };
    }
  };

  /* ---------- API ---------- */

  /** Vérifie les paramètres et lève une erreur explicite s'ils sont invalides. */
  function validate(operations, difficulty) {
    if (!Array.isArray(operations) || operations.length === 0) {
      throw new Error('Au moins une opération est requise.');
    }
    operations.forEach(function (op) {
      if (!Object.prototype.hasOwnProperty.call(OPERATIONS, op)) {
        throw new Error('Opération inconnue : ' + op);
      }
    });
    if (!Object.prototype.hasOwnProperty.call(RULES, difficulty)) {
      throw new Error('Difficulté inconnue : ' + difficulty);
    }
  }

  /** Tire une question au hasard parmi les opérations demandées. */
  function createQuestion(operations, rules) {
    const op = pick(operations);
    const operands = BUILDERS[op](rules);
    const definition = OPERATIONS[op];
    return {
      a: operands.a,
      b: operands.b,
      op: op,
      symbol: definition.symbol,
      answer: definition.compute(operands.a, operands.b)
    };
  }

  /** Identifiant unique d'un calcul (opération + opérandes). */
  function keyOf(question) {
    return question.op + ':' + question.a + ':' + question.b;
  }

  /**
   * Génère une question.
   * @param {string[]} operations  sous-ensemble de ['add', 'sub', 'mul', 'div']
   * @param {string}   difficulty  'facile' | 'moyen' | 'difficile'
   * @returns {{a:number, b:number, op:string, symbol:string, answer:number}}
   */
  function generateQuestion(operations, difficulty) {
    validate(operations, difficulty);
    const rules = RULES[difficulty];
    let question = createQuestion(operations, rules);
    for (let attempt = 1; attempt < MAX_ATTEMPTS && keyOf(question) === lastKey; attempt++) {
      question = createQuestion(operations, rules);
    }
    lastKey = keyOf(question);
    return question;
  }

  /** Oublie le dernier calcul proposé (à appeler en début de partie). */
  function reset() {
    lastKey = null;
  }

  /** Indique si une configuration peut produire un résultat négatif. */
  function canBeNegative(operations, difficulty) {
    return operations.indexOf('sub') !== -1 &&
      Object.prototype.hasOwnProperty.call(RULES, difficulty) &&
      RULES[difficulty].allowNegative;
  }

  return {
    OPERATIONS: OPERATIONS,
    RULES: RULES,
    generateQuestion: generateQuestion,
    reset: reset,
    canBeNegative: canBeNegative
  };
})();

/** Raccourci global demandé par le cahier des charges. */
const generateQuestion = Generator.generateQuestion;
