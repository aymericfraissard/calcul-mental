/* =========================================================
   app.js — Contrôleur de l'application
   ---------------------------------------------------------
   Gère les quatre écrans (accueil, historique, jeu,
   résultats), le déroulement d'une partie et l'affichage.
   Tout l'état modifiable est regroupé dans l'objet `state`.
   Dépend de : Store (storage.js), Theme (theme.js),
               Generator (generator.js), Timer (timer.js).
   ========================================================= */

(function () {
  'use strict';

  /* =======================================================
     Constantes
     ======================================================= */

  const OPERATION_ORDER = ['add', 'sub', 'mul', 'div'];
  const DIFFICULTIES = ['facile', 'moyen', 'difficile'];
  const DIFFICULTY_LABELS = { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile' };
  const TIMES = [3, 5, 10, 15, 30, 0]; // en secondes, 0 = illimité
  const MODES = ['serie', 'survie'];
  const COUNTS = [10, 20, 50];
  const LIVES = 3;
  const FEEDBACK_MS = { correct: 600, wrong: 1200 };
  const MAX_ANSWER_DIGITS = 6;
  const SCREENS = ['home', 'history', 'game', 'results'];

  const DEFAULT_CONFIG = Object.freeze({
    operations: ['add'],
    difficulty: 'facile',
    time: 10,
    mode: 'serie',
    count: 10
  });

  const DECIMAL_FORMAT = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });

  /* =======================================================
     État de l'application
     ======================================================= */

  const state = {
    screen: 'home',
    config: null,          // configuration choisie sur l'accueil
    game: null,            // partie en cours ou terminée (voir createGame)
    gameId: 0,             // incrémenté à chaque partie : invalide les callbacks périmés
    advanceTimeout: null,  // setTimeout entre le feedback et la question suivante
    advancePending: false, // passage à la suite suspendu pendant une confirmation
    frozenAnswer: '',      // valeur du champ, verrouillée pendant le feedback
    dialogCallback: null,  // action à exécuter à la fermeture de la boîte de dialogue
    helpHovered: null,     // aide « ? » survolée à la souris
    helpPinned: null       // aide « ? » ouverte au clic, au toucher ou au clavier
  };

  /** Références vers les éléments du DOM (remplies par cacheDom). */
  const dom = {};

  /* =======================================================
     Initialisation
     ======================================================= */

  function init() {
    cacheDom();
    bindEvents();
    state.config = sanitizeConfig(Store.loadConfig());
    applyConfigToForm(state.config);
    updateOpsHint();
    refreshHomeDetails();
    updateThemeButton();
    showScreen('home', { initial: true });
  }

  function cacheDom() {
    const byId = function (id) { return document.getElementById(id); };

    dom.screens = {};
    SCREENS.forEach(function (name) { dom.screens[name] = byId('screen-' + name); });

    // En-tête
    dom.themeToggle = byId('theme-toggle');
    dom.themeText = byId('theme-toggle-text');
    dom.iconMoon = byId('icon-moon');
    dom.iconSun = byId('icon-sun');

    // Accueil
    dom.configForm = byId('config-form');
    dom.opsHint = byId('ops-hint');
    dom.modeHint = byId('mode-hint');
    dom.countField = byId('count-field');
    dom.homeRecord = byId('home-record');
    dom.btnOpenHistory = byId('btn-open-history');
    dom.helps = Array.prototype.slice.call(document.querySelectorAll('[data-help]'));

    // Historique
    dom.historyTitle = byId('history-title');
    dom.recordsList = byId('records-list');
    dom.recordsEmpty = byId('records-empty');
    dom.historyList = byId('history-list');
    dom.historyEmpty = byId('history-empty');
    dom.storageWarning = byId('storage-warning');
    dom.btnClearHistory = byId('btn-clear-history');
    dom.btnHistoryBack = byId('btn-history-back');

    // Jeu
    dom.statProgress = byId('stat-progress');
    dom.statLivesBox = byId('stat-lives-box');
    dom.lives = byId('lives');
    dom.lifeDots = Array.prototype.slice.call(dom.lives.querySelectorAll('.life'));
    dom.statScore = byId('stat-score');
    dom.statStreak = byId('stat-streak');
    dom.btnAbandon = byId('btn-abandon');
    dom.gameCard = byId('game-card');
    dom.timer = byId('timer');
    dom.timerFill = byId('timer-fill');
    dom.timerCount = byId('timer-count');
    dom.question = byId('question');
    dom.qA = byId('q-a');
    dom.qOp = byId('q-op');
    dom.qB = byId('q-b');
    dom.qAnswer = byId('q-answer');
    dom.questionSpoken = byId('question-spoken');
    dom.answerForm = byId('answer-form');
    dom.answerInput = byId('answer-input');
    dom.btnSign = byId('btn-sign');
    dom.feedback = byId('feedback');

    // Résultats
    dom.recordBadge = byId('record-badge');
    dom.resScore = byId('res-score');
    dom.resTotal = byId('res-total');
    dom.resConfig = byId('res-config');
    dom.resPct = byId('res-pct');
    dom.resAvg = byId('res-avg');
    dom.resStreak = byId('res-streak');
    dom.missedEmpty = byId('missed-empty');
    dom.missedTable = byId('missed-table');
    dom.missedBody = byId('missed-body');
    dom.btnReplay = byId('btn-replay');
    dom.btnResultsHome = byId('btn-results-home');

    // Boîte de dialogue
    dom.dialog = byId('confirm-dialog');
    dom.dialogTitle = byId('dialog-title');
    dom.dialogMessage = byId('dialog-message');
    dom.dialogConfirm = byId('dialog-confirm');
    dom.dialogCancel = byId('dialog-cancel');
  }

  function bindEvents() {
    dom.themeToggle.addEventListener('click', Theme.toggle);
    Theme.setListener(updateThemeButton);

    dom.configForm.addEventListener('change', onConfigChange);
    dom.configForm.addEventListener('submit', onConfigSubmit);
    dom.btnOpenHistory.addEventListener('click', openHistory);
    bindHelps();

    dom.btnClearHistory.addEventListener('click', requestClearHistory);
    dom.btnHistoryBack.addEventListener('click', goHome);

    dom.answerForm.addEventListener('submit', onAnswerSubmit);
    dom.answerInput.addEventListener('input', onAnswerInput);
    // mousedown annulé : le clic sur ± ne retire pas le focus du champ
    dom.btnSign.addEventListener('mousedown', function (event) { event.preventDefault(); });
    dom.btnSign.addEventListener('click', toggleAnswerSign);
    dom.btnAbandon.addEventListener('click', requestAbandon);

    dom.btnReplay.addEventListener('click', replay);
    dom.btnResultsHome.addEventListener('click', goHome);

    dom.dialog.addEventListener('close', onDialogClose);
    document.addEventListener('keydown', onGlobalKeydown);
  }

  /* =======================================================
     Navigation entre écrans
     ======================================================= */

  function showScreen(name, options) {
    SCREENS.forEach(function (screen) {
      dom.screens[screen].hidden = screen !== name;
    });
    state.screen = name;
    if (name !== 'home') closeHelps();
    if (options && options.initial) return;
    window.scrollTo(0, 0);
    focusScreen(name);
  }

  /** Place le focus au bon endroit pour le clavier et les lecteurs d'écran. */
  function focusScreen(name) {
    if (name === 'game') {
      dom.answerInput.focus();
      return;
    }
    const target = dom.screens[name].querySelector('[data-autofocus]');
    if (target) target.focus();
  }

  function goHome() {
    clearGameTimers(); // sécurité : aucun timer ne survit au retour à l'accueil
    state.game = null;
    refreshHomeDetails();
    showScreen('home');
  }

  function onGlobalKeydown(event) {
    if (event.key === 'Escape' && state.screen === 'home' && isHelpOpen()) {
      closeHelps();
      return;
    }
    if (event.key !== 'Escape' || dom.dialog.open || state.screen !== 'game') return;
    event.preventDefault();
    requestAbandon();
  }

  /* =======================================================
     Accueil : configuration
     ======================================================= */

  /** Valide une configuration (lue du formulaire ou du stockage). */
  function sanitizeConfig(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const operations = Array.isArray(source.operations)
      ? OPERATION_ORDER.filter(function (op) { return source.operations.indexOf(op) !== -1; })
      : [];
    return {
      operations: operations.length > 0 ? operations : DEFAULT_CONFIG.operations.slice(),
      difficulty: DIFFICULTIES.indexOf(source.difficulty) !== -1 ? source.difficulty : DEFAULT_CONFIG.difficulty,
      time: TIMES.indexOf(source.time) !== -1 ? source.time : DEFAULT_CONFIG.time,
      mode: MODES.indexOf(source.mode) !== -1 ? source.mode : DEFAULT_CONFIG.mode,
      count: COUNTS.indexOf(source.count) !== -1 ? source.count : DEFAULT_CONFIG.count
    };
  }

  function checkedOperationInputs() {
    return dom.configForm.querySelectorAll('input[name="operation"]:checked');
  }

  function readConfigFromForm() {
    const fields = dom.configForm.elements;
    return sanitizeConfig({
      operations: Array.prototype.map.call(checkedOperationInputs(), function (input) { return input.value; }),
      difficulty: fields.difficulty.value,
      time: Number(fields.time.value),
      mode: fields.mode.value,
      count: Number(fields.count.value)
    });
  }

  function applyConfigToForm(config) {
    const fields = dom.configForm.elements;
    dom.configForm.querySelectorAll('input[name="operation"]').forEach(function (input) {
      input.checked = config.operations.indexOf(input.value) !== -1;
    });
    fields.difficulty.value = config.difficulty;
    fields.time.value = String(config.time);
    fields.mode.value = config.mode;
    fields.count.value = String(config.count);
  }

  function onConfigChange(event) {
    const target = event.target;
    if (target.name === 'operation' && checkedOperationInputs().length === 0) {
      target.checked = true; // au moins une opération reste obligatoire
      setOpsHint('Au moins une opération est requise.', true);
    } else {
      updateOpsHint();
    }
    refreshHomeDetails();
  }

  function onConfigSubmit(event) {
    event.preventDefault();
    startGame(readConfigFromForm());
  }

  function updateOpsHint() {
    const isMixed = checkedOperationInputs().length > 1;
    setOpsHint(isMixed
      ? 'Mode mixte : chaque question tire une opération au hasard parmi celles cochées.'
      : 'Cochez plusieurs opérations pour jouer en mode mixte.', false);
  }

  function setOpsHint(text, isError) {
    if (dom.opsHint.textContent !== text) dom.opsHint.textContent = text;
    dom.opsHint.classList.toggle('is-error', isError);
  }

  /** Met à jour les éléments de l'accueil qui dépendent de la configuration. */
  function refreshHomeDetails() {
    const config = readConfigFromForm();
    updateModeFields(config);
    updateHomeRecord(config);
  }

  function updateModeFields(config) {
    const isSerie = config.mode === 'serie';
    dom.countField.hidden = !isSerie;
    dom.modeHint.textContent = isSerie
      ? 'Un nombre fixe de questions.'
      : 'La partie continue jusqu\'à ' + LIVES + ' erreurs (réponse fausse ou temps écoulé).';
  }

  function updateHomeRecord(config) {
    const record = Store.getRecord(Store.configKey(config));
    dom.homeRecord.textContent = isValidResult(record)
      ? 'Record pour cette configuration : ' + formatRecordScore(record)
      : 'Pas encore de record pour cette configuration.';
  }

  /* =======================================================
     Accueil : aides dépliables (points d'interrogation)
     - survol à la souris : ouverte tant que le pointeur est dessus ;
     - clic, toucher, Entrée ou Espace : ouvre / referme ;
     - Échap, clic ailleurs ou Tab vers un autre élément : referme.
     ======================================================= */

  function bindHelps() {
    dom.helps.forEach(function (help) {
      help.addEventListener('pointerenter', function (event) {
        if (event.pointerType === 'mouse') setHelpState(help, state.helpPinned);
      });
      help.addEventListener('pointerleave', function (event) {
        if (event.pointerType === 'mouse' && state.helpHovered === help) setHelpState(null, state.helpPinned);
      });
      help.addEventListener('focusout', function (event) {
        // relatedTarget vide = clic ailleurs, déjà géré par onDocumentClick
        const leftHelp = event.relatedTarget && !help.contains(event.relatedTarget);
        if (leftHelp && state.helpPinned === help) setHelpState(state.helpHovered, null);
      });
      help.querySelector('.help-toggle').addEventListener('click', function () {
        toggleHelp(help);
      });
    });
    document.addEventListener('click', onDocumentClick);
  }

  /** Le bouton referme l'aide si elle est visible, sinon l'ouvre. */
  function toggleHelp(help) {
    if (isHelpVisible(help)) setHelpState(null, null);
    else setHelpState(state.helpHovered, help);
  }

  function onDocumentClick(event) {
    if (state.helpPinned && !state.helpPinned.contains(event.target)) {
      setHelpState(state.helpHovered, null);
    }
  }

  function isHelpVisible(help) {
    return help === state.helpHovered || help === state.helpPinned;
  }

  function isHelpOpen() {
    return state.helpHovered !== null || state.helpPinned !== null;
  }

  function closeHelps() {
    setHelpState(null, null);
  }

  function setHelpState(hovered, pinned) {
    state.helpHovered = hovered;
    state.helpPinned = pinned;
    dom.helps.forEach(function (help) {
      const open = isHelpVisible(help);
      help.classList.toggle('is-open', open);
      help.querySelector('.help-toggle').setAttribute('aria-expanded', String(open));
    });
  }

  /* =======================================================
     Partie : démarrage et questions
     ======================================================= */

  function startGame(config) {
    clearGameTimers();
    state.gameId += 1;
    state.config = config;
    Store.saveConfig(config);
    Generator.reset();
    state.game = createGame(config);
    prepareGameScreen(state.game);
    showScreen('game');
    nextQuestion();
  }

  function createGame(config) {
    return {
      config: config,
      allowNegative: Generator.canBeNegative(config.operations, config.difficulty),
      phase: 'idle',      // 'question' | 'feedback' | 'over'
      question: null,
      questionNumber: 0,
      correct: 0,
      streak: 0,
      bestStreak: 0,
      lives: LIVES,
      entries: []         // une entrée par question jouée (voir resolveQuestion)
    };
  }

  function prepareGameScreen(game) {
    dom.statLivesBox.hidden = game.config.mode !== 'survie';
    dom.timer.hidden = game.config.time === 0;
    dom.btnSign.hidden = !game.allowNegative;
    resetAnswerField();
  }

  function nextQuestion() {
    const game = state.game;
    state.advancePending = false;
    game.question = Generator.generateQuestion(game.config.operations, game.config.difficulty);
    game.questionNumber += 1;
    game.phase = 'question';
    renderQuestion(game.question, game.questionNumber);
    renderStats(game);
    resetAnswerField();
    startQuestionTimer(game.config.time);
  }

  function startQuestionTimer(seconds) {
    const gameId = state.gameId;
    const durationMs = seconds * 1000;
    if (durationMs > 0) renderTimer(durationMs, 1);
    Timer.start(durationMs, renderTimer, function () {
      if (gameId === state.gameId) onTimeExpired();
    });
  }

  /** Appelée à chaque frame par le Timer : barre fluide + compteur. */
  function renderTimer(remainingMs, ratio) {
    dom.timerFill.style.transform = 'scaleX(' + ratio.toFixed(4) + ')';
    dom.timerFill.classList.toggle('is-warning', ratio < 0.30 && ratio >= 0.15);
    dom.timerFill.classList.toggle('is-danger', ratio < 0.15);
    const label = formatCountdown(remainingMs);
    if (dom.timerCount.textContent !== label) dom.timerCount.textContent = label;
  }

  function renderQuestion(question, number) {
    dom.qA.textContent = formatNumber(question.a);
    dom.qOp.textContent = question.symbol;
    dom.qB.textContent = formatNumber(question.b);
    dom.qAnswer.textContent = '?';
    // Taille calculée sur le calcul complet (réponse comprise) : pas de saut à l'affichage de la réponse
    const fullText = formatOperation(question) + ' = ' + formatNumber(question.answer);
    dom.question.style.setProperty('--chars', String(fullText.length));
    const spoken = Generator.OPERATIONS[question.op].spoken;
    dom.questionSpoken.textContent =
      'Question ' + number + ' : combien font ' + question.a + ' ' + spoken + ' ' + question.b + ' ?';
  }

  function renderStats(game) {
    dom.statProgress.textContent = game.config.mode === 'serie'
      ? game.questionNumber + ' / ' + game.config.count
      : String(game.questionNumber);
    dom.statScore.textContent = String(game.correct);
    dom.statStreak.textContent = String(game.streak);
    renderLives(game.lives);
  }

  function renderLives(lives) {
    dom.lifeDots.forEach(function (dot, index) {
      dot.classList.toggle('is-lost', index >= lives);
    });
    dom.lives.setAttribute('aria-label',
      pluralize(lives, 'vie restante', 'vies restantes') + ' sur ' + LIVES);
  }

  /* =======================================================
     Partie : saisie et correction
     ======================================================= */

  function onAnswerSubmit(event) {
    event.preventDefault();
    const game = state.game;
    if (!game || game.phase !== 'question') return;
    const value = parseAnswer(dom.answerInput.value);
    if (value === null) {
      dom.answerInput.focus(); // champ vide : on attend une vraie réponse
      return;
    }
    resolveQuestion(value, false);
  }

  function onTimeExpired() {
    if (state.game && state.game.phase === 'question') resolveQuestion(null, true);
  }

  /** Filtre la saisie : chiffres uniquement, signe moins si possible. */
  function onAnswerInput() {
    const input = dom.answerInput;
    const game = state.game;
    if (!game || game.phase !== 'question') {
      input.value = state.frozenAnswer; // champ verrouillé pendant le feedback
      return;
    }
    const clean = sanitizeAnswer(input.value, game.allowNegative);
    if (clean !== input.value) input.value = clean;
  }

  function sanitizeAnswer(raw, allowNegative) {
    const text = raw.replace(/[−‒–—]/g, '-').trim();
    const negative = allowNegative && text.charAt(0) === '-';
    const digits = text.replace(/\D/g, '').slice(0, MAX_ANSWER_DIGITS);
    return (negative ? '-' : '') + digits;
  }

  function parseAnswer(text) {
    return /^-?\d+$/.test(text) ? Number(text) : null;
  }

  /** Bouton ± (utile sur mobile où le clavier numérique n'a pas de signe moins). */
  function toggleAnswerSign() {
    const game = state.game;
    if (!game || game.phase !== 'question' || !game.allowNegative) return;
    const value = dom.answerInput.value;
    dom.answerInput.value = value.charAt(0) === '-' ? value.slice(1) : '-' + value;
    dom.answerInput.focus();
  }

  /**
   * Termine la question courante (réponse donnée ou temps écoulé),
   * met à jour le score puis programme la suite.
   */
  function resolveQuestion(given, timedOut) {
    const game = state.game;
    Timer.stop();
    const entry = {
      question: game.question,
      given: given,
      timedOut: timedOut,
      isCorrect: !timedOut && given === game.question.answer,
      ms: Timer.elapsed()
    };
    game.entries.push(entry);
    game.phase = 'feedback';
    updateScore(game, entry.isCorrect);
    renderStats(game);
    showFeedback(entry);
    scheduleAdvance(entry.isCorrect ? FEEDBACK_MS.correct : FEEDBACK_MS.wrong);
  }

  function updateScore(game, isCorrect) {
    if (isCorrect) {
      game.correct += 1;
      game.streak += 1;
      game.bestStreak = Math.max(game.bestStreak, game.streak);
      return;
    }
    game.streak = 0;
    if (game.config.mode === 'survie') game.lives -= 1;
  }

  function showFeedback(entry) {
    state.frozenAnswer = dom.answerInput.value;
    setFeedbackStatus(entry.isCorrect ? 'correct' : 'wrong');
    dom.qAnswer.textContent = formatNumber(entry.question.answer);
    dom.feedback.textContent = feedbackMessage(entry);
  }

  function feedbackMessage(entry) {
    if (entry.isCorrect) return 'Juste !';
    const prefix = entry.timedOut ? 'Temps écoulé.' : 'Faux.';
    return prefix + ' La bonne réponse était ' + formatNumber(entry.question.answer) + '.';
  }

  /** Applique l'état visuel juste / faux (ou le retire avec null). */
  function setFeedbackStatus(status) {
    ['correct', 'wrong'].forEach(function (name) {
      const active = status === name;
      dom.gameCard.classList.toggle('is-' + name, active);
      dom.answerInput.classList.toggle('is-' + name, active);
      dom.feedback.classList.toggle('is-' + name, active);
    });
  }

  function resetAnswerField() {
    state.frozenAnswer = '';
    dom.answerInput.value = '';
    dom.feedback.textContent = '';
    setFeedbackStatus(null);
    if (!dom.dialog.open) dom.answerInput.focus();
  }

  /* =======================================================
     Partie : enchaînement, fin, nettoyage des timers
     ======================================================= */

  function scheduleAdvance(delayMs) {
    const gameId = state.gameId;
    clearAdvanceTimeout();
    state.advanceTimeout = window.setTimeout(function () {
      state.advanceTimeout = null;
      if (gameId === state.gameId) advance();
    }, delayMs);
  }

  function advance() {
    if (isGameOver(state.game)) endGame();
    else nextQuestion();
  }

  function isGameOver(game) {
    if (game.config.mode === 'survie') return game.lives <= 0;
    return game.entries.length >= game.config.count;
  }

  function clearAdvanceTimeout() {
    if (state.advanceTimeout !== null) {
      window.clearTimeout(state.advanceTimeout);
      state.advanceTimeout = null;
    }
  }

  /** Arrête tout ce qui pourrait encore s'exécuter pour la partie en cours. */
  function clearGameTimers() {
    Timer.stop();
    clearAdvanceTimeout();
    state.advancePending = false;
  }

  function endGame() {
    const game = state.game;
    clearGameTimers();
    game.phase = 'over';
    const summary = summarizeGame(game);
    summary.isRecord = saveGameResult(game.config, summary);
    renderResults(summary);
    showScreen('results');
  }

  function summarizeGame(game) {
    const total = game.entries.length;
    // Temps moyen calculé sur les questions répondues (les temps écoulés sont exclus)
    const answered = game.entries.filter(function (entry) { return !entry.timedOut; });
    const totalMs = answered.reduce(function (sum, entry) { return sum + entry.ms; }, 0);
    return {
      config: game.config,
      correct: game.correct,
      total: total,
      percent: total > 0 ? Math.round((game.correct / total) * 100) : 0,
      avgMs: answered.length > 0 ? Math.round(totalMs / answered.length) : null,
      bestStreak: game.bestStreak,
      missed: game.entries.filter(function (entry) { return !entry.isCorrect; })
    };
  }

  /** Enregistre la partie dans l'historique et renvoie true si c'est un record. */
  function saveGameResult(config, summary) {
    const key = Store.configKey(config);
    const result = {
      date: new Date().toISOString(),
      key: key,
      label: formatConfigLabel(config),
      mode: config.mode,
      correct: summary.correct,
      total: summary.total,
      avgMs: summary.avgMs
    };
    Store.addHistory(result);
    return Store.saveRecord(key, result);
  }

  function replay() {
    if (state.game) startGame(state.game.config);
  }

  /* =======================================================
     Abandon (avec confirmation dans l'interface)
     ======================================================= */

  function requestAbandon() {
    const game = state.game;
    const inProgress = game && (game.phase === 'question' || game.phase === 'feedback');
    if (!inProgress || dom.dialog.open) return;
    pauseGame();
    openDialog({
      title: 'Abandonner la partie ?',
      message: 'La partie en cours ne sera pas enregistrée.',
      confirmLabel: 'Abandonner',
      cancelLabel: 'Continuer',
      focus: 'confirm'
    }, function (confirmed) {
      if (confirmed) abandonGame();
      else resumeGame();
    });
  }

  /** Met la partie en pause pendant la confirmation (timer et enchaînement). */
  function pauseGame() {
    Timer.pause();
    if (state.advanceTimeout !== null) {
      clearAdvanceTimeout();
      state.advancePending = true;
    }
  }

  function resumeGame() {
    const game = state.game;
    if (!game || game.phase === 'over') return;
    if (state.advancePending) {
      state.advancePending = false;
      advance();
      return;
    }
    Timer.resume();
    dom.answerInput.focus();
  }

  function abandonGame() {
    clearGameTimers();
    state.gameId += 1;
    goHome();
  }

  /* =======================================================
     Résultats
     ======================================================= */

  function renderResults(summary) {
    dom.recordBadge.hidden = !summary.isRecord;
    dom.resScore.textContent = String(summary.correct);
    dom.resTotal.textContent = String(summary.total);
    dom.resConfig.textContent = formatConfigLabel(summary.config);
    dom.resPct.textContent = summary.percent + ' %';
    dom.resAvg.textContent = summary.avgMs === null ? '—' : formatDuration(summary.avgMs);
    dom.resStreak.textContent = String(summary.bestStreak);
    renderMissed(summary.missed);
  }

  function renderMissed(missed) {
    replaceChildren(dom.missedBody, missed.map(createMissedRow));
    dom.missedTable.hidden = missed.length === 0;
    dom.missedEmpty.hidden = missed.length > 0;
  }

  function createMissedRow(entry) {
    const question = entry.question;
    const row = document.createElement('tr');
    row.appendChild(createElement('td', '', formatOperation(question)));
    row.appendChild(createElement('td', 'is-wrong', entry.timedOut ? 'Temps écoulé' : formatNumber(entry.given)));
    row.appendChild(createElement('td', 'is-right', formatNumber(question.answer)));
    return row;
  }

  /* =======================================================
     Historique & records
     ======================================================= */

  function openHistory() {
    renderHistory();
    showScreen('history');
  }

  function renderHistory() {
    const history = Store.getHistory().filter(isValidResult);
    const records = objectValues(Store.getRecords()).filter(isValidResult).sort(byDateDesc);
    renderList(dom.historyList, dom.historyEmpty, history, createHistoryItem);
    renderList(dom.recordsList, dom.recordsEmpty, records, createRecordItem);
    dom.btnClearHistory.disabled = history.length === 0 && records.length === 0;
    dom.storageWarning.hidden = Store.isPersistent();
  }

  function renderList(listElement, emptyElement, items, createItem) {
    replaceChildren(listElement, items.map(createItem));
    listElement.hidden = items.length === 0;
    emptyElement.hidden = items.length > 0;
  }

  function createHistoryItem(entry) {
    return createListItem(entry.label, formatDate(entry.date), entry.correct + ' / ' + entry.total);
  }

  function createRecordItem(record) {
    let meta = 'Le ' + formatDate(record.date);
    if (typeof record.avgMs === 'number') meta += ' · ' + formatDuration(record.avgMs) + ' en moyenne';
    return createListItem(record.label, meta, formatRecordScore(record));
  }

  function createListItem(title, meta, score) {
    const item = createElement('li', 'list-item', '');
    const main = createElement('div', 'list-main', '');
    main.appendChild(createElement('p', 'list-title', title));
    main.appendChild(createElement('p', 'list-meta', meta));
    item.appendChild(main);
    item.appendChild(createElement('p', 'list-score', score));
    return item;
  }

  function requestClearHistory() {
    openDialog({
      title: 'Effacer l\'historique ?',
      message: 'Toutes les parties enregistrées et tous les records seront supprimés. Cette action est irréversible.',
      confirmLabel: 'Effacer',
      cancelLabel: 'Annuler',
      danger: true,
      focus: 'cancel'
    }, function (confirmed) {
      if (!confirmed) return;
      Store.clearHistory();
      renderHistory();
      dom.historyTitle.focus();
    });
  }

  /** Ignore les entrées mal formées (stockage modifié à la main, ancienne version…). */
  function isValidResult(entry) {
    return Boolean(entry) && typeof entry === 'object' &&
      typeof entry.label === 'string' && typeof entry.date === 'string' &&
      typeof entry.correct === 'number' && typeof entry.total === 'number';
  }

  function byDateDesc(a, b) {
    return b.date.localeCompare(a.date);
  }

  /* =======================================================
     Boîte de dialogue de confirmation (<dialog> natif, pas de confirm())
     ======================================================= */

  function openDialog(options, callback) {
    dom.dialogTitle.textContent = options.title;
    dom.dialogMessage.textContent = options.message;
    dom.dialogConfirm.textContent = options.confirmLabel;
    dom.dialogCancel.textContent = options.cancelLabel;
    dom.dialogConfirm.className = 'btn ' + (options.danger ? 'btn-danger' : 'btn-primary');
    state.dialogCallback = callback;
    dom.dialog.returnValue = '';
    dom.dialog.showModal();
    (options.focus === 'cancel' ? dom.dialogCancel : dom.dialogConfirm).focus();
  }

  /** Fermeture par un bouton ou par Échap (returnValue vide = annulation). */
  function onDialogClose() {
    const callback = state.dialogCallback;
    state.dialogCallback = null;
    if (callback) callback(dom.dialog.returnValue === 'confirm');
  }

  /* =======================================================
     Thème
     ======================================================= */

  function updateThemeButton() {
    const isDark = Theme.current() === 'dark';
    dom.themeText.textContent = isDark ? 'Thème clair' : 'Thème sombre';
    dom.themeToggle.title = isDark ? 'Passer au thème clair' : 'Passer au thème sombre';
    dom.iconMoon.hidden = isDark;
    dom.iconSun.hidden = !isDark;
  }

  /* =======================================================
     Formatage
     ======================================================= */

  /** Affiche les nombres négatifs avec le vrai signe moins (−). */
  function formatNumber(value) {
    return value < 0 ? '−' + Math.abs(value) : String(value);
  }

  function formatOperation(question) {
    return formatNumber(question.a) + ' ' + question.symbol + ' ' + formatNumber(question.b);
  }

  /** Compte à rebours arrondi au dixième supérieur : « 4,2 s ». */
  function formatCountdown(ms) {
    return DECIMAL_FORMAT.format(Math.ceil(ms / 100) / 10) + ' s';
  }

  function formatDuration(ms) {
    return DECIMAL_FORMAT.format(ms / 1000) + ' s';
  }

  function formatDate(iso) {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '—';
    const day = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return day + ' à ' + time;
  }

  /** Exemple : « Mixte + × · Moyen · 10 s · Série de 20 ». */
  function formatConfigLabel(config) {
    const operations = config.operations.length === 1
      ? Generator.OPERATIONS[config.operations[0]].label
      : 'Mixte ' + config.operations.map(function (op) { return Generator.OPERATIONS[op].symbol; }).join(' ');
    const time = config.time === 0 ? 'Temps illimité' : config.time + ' s';
    const mode = config.mode === 'serie' ? 'Série de ' + config.count : 'Survie';
    return [operations, DIFFICULTY_LABELS[config.difficulty], time, mode].join(' · ');
  }

  function formatRecordScore(record) {
    return record.mode === 'survie'
      ? pluralize(record.correct, 'bonne réponse', 'bonnes réponses')
      : record.correct + ' / ' + record.total;
  }

  /** Accord en français : 0 et 1 au singulier. */
  function pluralize(count, singular, plural) {
    return count + ' ' + (Math.abs(count) > 1 ? plural : singular);
  }

  /* =======================================================
     Petits outils DOM
     ======================================================= */

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function replaceChildren(parent, children) {
    while (parent.firstChild) parent.removeChild(parent.firstChild);
    children.forEach(function (child) { parent.appendChild(child); });
  }

  function objectValues(object) {
    return Object.keys(object).map(function (key) { return object[key]; });
  }

  init();
})();
