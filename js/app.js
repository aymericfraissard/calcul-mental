/* =========================================================
   app.js — Contrôleur de l'application
   ---------------------------------------------------------
   Gère les quatre écrans (accueil, profil, jeu, résultats),
   le déroulement d'une partie et l'affichage.
   Il n'y a pas de temps imparti : un chronomètre discret
   mesure chaque réponse, convertie en note de rapidité.
   Tout l'état modifiable est regroupé dans l'objet `state`.
   Dépend de : Store (storage.js), Theme (theme.js),
               Generator (generator.js), Stats (stats.js),
               Timer (timer.js), Ui (ui.js), Charts (charts.js),
               Profile (profile.js).
   ========================================================= */

(function () {
  'use strict';

  /* =======================================================
     Constantes
     ======================================================= */

  const OPERATION_ORDER = ['add', 'sub', 'mul', 'div'];
  const DIFFICULTIES = ['facile', 'moyen', 'difficile'];
  const MODES = ['serie', 'survie'];
  const COUNTS = [10, 20, 50];
  const LIVES = 3;
  const FEEDBACK_MS = { correct: 900, wrong: 1400 };
  const MAX_ANSWER_DIGITS = 6;
  const SCREENS = ['home', 'profile', 'game', 'results'];

  const DEFAULT_CONFIG = Object.freeze({
    operations: ['add'],
    difficulty: 'facile',
    mode: 'serie',
    count: 10
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
    Profile.init({ confirm: openDialog, onPlay: goHome });
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
    dom.siteNav = byId('site-nav');
    dom.navLinks = Array.prototype.slice.call(dom.siteNav.querySelectorAll('[data-nav]'));
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
    dom.helps = Array.prototype.slice.call(document.querySelectorAll('[data-help]'));

    // Jeu
    dom.statProgress = byId('stat-progress');
    dom.statLivesBox = byId('stat-lives-box');
    dom.lives = byId('lives');
    dom.lifeDots = Array.prototype.slice.call(dom.lives.querySelectorAll('.life'));
    dom.statScore = byId('stat-score');
    dom.statStreak = byId('stat-streak');
    dom.btnAbandon = byId('btn-abandon');
    dom.gameCard = byId('game-card');
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
    dom.resNote = byId('res-note');
    dom.resStreak = byId('res-streak');
    dom.resTiers = byId('res-tiers');
    dom.resTiersNote = byId('res-tiers-note');
    dom.resTiersEmpty = byId('res-tiers-empty');
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
    dom.navLinks.forEach(function (link) {
      link.addEventListener('click', function () {
        if (link.getAttribute('data-nav') === 'profile') openProfile();
        else goHome();
      });
    });
    dom.themeToggle.addEventListener('click', Theme.toggle);
    Theme.setListener(updateThemeButton);

    dom.configForm.addEventListener('change', onConfigChange);
    dom.configForm.addEventListener('submit', onConfigSubmit);
    bindHelps();

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
    updateNav(name);
    if (name !== 'home') closeHelps();
    if (options && options.initial) return;
    window.scrollTo(0, 0);
    focusScreen(name);
  }

  /** Onglets « Jouer » / « Profil » : masqués pendant une partie. */
  function updateNav(name) {
    dom.siteNav.hidden = name === 'game';
    dom.navLinks.forEach(function (link) {
      const isProfileLink = link.getAttribute('data-nav') === 'profile';
      const current = isProfileLink === (name === 'profile');
      if (current) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
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

  function openProfile() {
    clearGameTimers();
    state.game = null;
    showScreen('profile');
    Profile.render();
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
      : 'La partie continue jusqu\'à ' + LIVES + ' réponses fausses.';
  }

  function updateHomeRecord(config) {
    const record = Stats.bestGame(Store.getGames(), Stats.configKey(config));
    dom.homeRecord.textContent = record
      ? 'Record pour cette configuration : ' + Ui.formatRecordScore(record)
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
    Timer.start(); // chronomètre discret : rien n'est affiché pendant la question
  }

  function renderQuestion(question, number) {
    dom.qA.textContent = Ui.formatNumber(question.a);
    dom.qOp.textContent = question.symbol;
    dom.qB.textContent = Ui.formatNumber(question.b);
    dom.qAnswer.textContent = '?';
    // Taille calculée sur le calcul complet (réponse comprise) : pas de saut à l'affichage de la réponse
    const fullText = Ui.formatOperation(question) + ' = ' + Ui.formatNumber(question.answer);
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
      Ui.pluralize(lives, 'vie restante', 'vies restantes') + ' sur ' + LIVES);
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
    resolveQuestion(value);
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

  /** Termine la question courante : arrête le chronomètre, note, puis programme la suite. */
  function resolveQuestion(given) {
    const game = state.game;
    Timer.stop();
    const ms = Timer.elapsed();
    const isCorrect = given === game.question.answer;
    const entry = {
      question: game.question,
      given: given,
      isCorrect: isCorrect,
      ms: ms,
      tier: isCorrect ? Stats.tierFor(ms) : null
    };
    game.entries.push(entry);
    game.phase = 'feedback';
    updateScore(game, isCorrect);
    renderStats(game);
    showFeedback(entry);
    scheduleAdvance(isCorrect ? FEEDBACK_MS.correct : FEEDBACK_MS.wrong);
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
    dom.qAnswer.textContent = Ui.formatNumber(entry.question.answer);
    dom.feedback.textContent = feedbackMessage(entry);
  }

  /** « Juste ! 2,4 s · Réflexe » ou « Faux. La bonne réponse était 56. » */
  function feedbackMessage(entry) {
    if (entry.isCorrect) return 'Juste ! ' + Ui.formatSeconds(entry.ms) + ' · ' + entry.tier.label;
    return 'Faux. La bonne réponse était ' + Ui.formatNumber(entry.question.answer) + '.';
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
    const record = Stats.buildGameRecord(game.config, game.entries, game.bestStreak, new Date().toISOString());
    // Record comparé aux parties déjà enregistrées, avant d'ajouter celle-ci
    const previousBest = Stats.bestGame(Store.getGames(), Stats.configKey(game.config));
    const isRecord = Stats.isBetter(record, previousBest);
    Store.addGame(record);
    renderResults(summarizeGame(game, record, isRecord));
    showScreen('results');
  }

  function summarizeGame(game, record, isRecord) {
    const totals = Stats.totalsOf(record);
    return {
      config: game.config,
      isRecord: isRecord,
      correct: record.correct,
      total: record.total,
      percent: record.total > 0 ? Math.round((record.correct / record.total) * 100) : 0,
      avgMs: Stats.averageMs(record),
      note: Stats.speedNote(totals.pts, totals.c),
      tiers: totals.tiers,
      bestStreak: game.bestStreak,
      missed: game.entries.filter(function (entry) { return !entry.isCorrect; })
    };
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

  /** Met la partie en pause pendant la confirmation (chronomètre et enchaînement). */
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
    dom.resConfig.textContent = Ui.formatConfigLabel(summary.config);
    dom.resPct.textContent = summary.percent + ' %';
    dom.resAvg.textContent = summary.avgMs === null ? '—' : Ui.formatSeconds(summary.avgMs);
    dom.resNote.textContent = summary.note === null ? '—' : Ui.formatNote(summary.note) + ' / 20';
    dom.resStreak.textContent = String(summary.bestStreak);
    renderResultTiers(summary);
    renderMissed(summary.missed);
  }

  function renderResultTiers(summary) {
    const hasCorrect = summary.correct > 0;
    dom.resTiers.hidden = !hasCorrect;
    dom.resTiersNote.hidden = !hasCorrect;
    dom.resTiersEmpty.hidden = hasCorrect;
    if (hasCorrect) Charts.renderTierBars(dom.resTiers, summary.tiers);
  }

  function renderMissed(missed) {
    Ui.replaceChildren(dom.missedBody, missed.map(createMissedRow));
    dom.missedTable.hidden = missed.length === 0;
    dom.missedEmpty.hidden = missed.length > 0;
  }

  function createMissedRow(entry) {
    const question = entry.question;
    const row = document.createElement('tr');
    row.appendChild(Ui.createElement('td', '', Ui.formatOperation(question)));
    row.appendChild(Ui.createElement('td', 'is-wrong', Ui.formatNumber(entry.given)));
    row.appendChild(Ui.createElement('td', 'is-right', Ui.formatNumber(question.answer)));
    return row;
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

  init();
})();
