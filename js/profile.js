/* =========================================================
   profile.js — Onglet « Profil » : statistiques et graphiques
   ---------------------------------------------------------
   Tout est recalculé à partir des parties enregistrées, à
   chaque ouverture de l'onglet et à chaque changement de
   filtre. Les filtres (difficulté, opération) s'appliquent
   à tout ce qui est affiché en dessous.
   Dépend de : Store, Stats, Ui, Charts.
   ========================================================= */

const Profile = (function () {
  'use strict';

  const MOVING_AVERAGE = 5;   // parties prises dans la moyenne glissante
  const ACTIVITY_DAYS = 30;
  const RECENT_LIMIT = 20;
  const COMPARE_WINDOW = 10;  // dernières parties comparées aux précédentes

  /** Les trois courbes d'évolution (petits multiples, un axe chacune). */
  const EVOLUTION_CHARTS = [
    {
      metric: 'rate',
      chartId: 'chart-rate',
      emptyId: 'chart-rate-empty',
      label: 'Taux de réussite',
      scale: { max: 100, ticks: [0, 25, 50, 75, 100] },
      format: function (v) { return Math.round(v) + ' %'; },
      formatTick: function (v) { return v + ' %'; }
    },
    {
      metric: 'time',
      chartId: 'chart-time',
      emptyId: 'chart-time-empty',
      label: 'Temps moyen par question',
      scale: null,
      format: function (v) { return Ui.formatDecimal(v) + ' s'; },
      formatTick: function (v) { return Ui.formatCompact(v) + ' s'; }
    },
    {
      metric: 'note',
      chartId: 'chart-note',
      emptyId: 'chart-note-empty',
      label: 'Note de rapidité sur 20',
      scale: { max: 20, ticks: [0, 5, 10, 15, 20] },
      format: function (v) { return Ui.formatNote(v); },
      formatTick: function (v) { return String(v); }
    }
  ];

  /** Comparaison « dernières parties / parties d'avant » des tuiles. */
  const DELTAS = {
    rate: {
      read: function (s) { return s.rate === null ? null : s.rate * 100; },
      higherIsBetter: true,
      threshold: 0.5,
      unit: function (abs) { return abs >= 2 ? 'pts' : 'pt'; }
    },
    time: {
      read: function (s) { return s.avgMs === null ? null : s.avgMs / 1000; },
      higherIsBetter: false,
      threshold: 0.05,
      unit: function () { return 's'; }
    },
    note: {
      read: function (s) { return s.note; },
      higherIsBetter: true,
      threshold: 0.05,
      unit: function (abs) { return abs >= 2 ? 'pts' : 'pt'; }
    }
  };

  const dom = {};
  let options = null;          // { confirm(options, callback), onPlay() }
  let currentSlices = [];      // parties retenues par les filtres (pour les tableaux)
  let currentDays = [];

  /* =======================================================
     Initialisation
     ======================================================= */

  function init(callbacks) {
    options = callbacks;
    const byId = function (id) { return document.getElementById(id); };
    dom.title = byId('profile-title');
    dom.subtitle = byId('profile-subtitle');
    dom.empty = byId('profile-empty');
    dom.btnPlay = byId('btn-profile-play');
    dom.content = byId('profile-content');
    dom.filters = byId('profile-filters');
    dom.filterDifficulty = byId('filter-difficulty');
    dom.filterOp = byId('filter-op');
    dom.filterEmpty = byId('filter-empty');
    dom.body = byId('profile-body');
    dom.kpis = byId('kpis');
    dom.kpiCompare = byId('kpi-compare');
    dom.evolutionDetails = byId('evolution-details');
    dom.evolutionBody = byId('evolution-body');
    dom.activitySummary = byId('activity-summary');
    dom.activityChart = byId('chart-activity');
    dom.activityEmpty = byId('activity-empty');
    dom.activityDetails = byId('activity-details');
    dom.activityBody = byId('activity-body');
    dom.opsTable = byId('ops-table');
    dom.opsBody = byId('ops-body');
    dom.opsEmpty = byId('ops-empty');
    dom.tiers = byId('profile-tiers');
    dom.tiersNote = byId('profile-tiers-note');
    dom.tiersEmpty = byId('profile-tiers-empty');
    dom.recordsList = byId('records-list');
    dom.recordsEmpty = byId('records-empty');
    dom.historyList = byId('history-list');
    dom.historyEmpty = byId('history-empty');
    dom.storageWarning = byId('storage-warning');
    dom.btnClear = byId('btn-clear-stats');
    EVOLUTION_CHARTS.forEach(function (def) {
      dom[def.chartId] = byId(def.chartId);
      dom[def.emptyId] = byId(def.emptyId);
    });

    dom.filters.addEventListener('change', render);
    dom.filters.addEventListener('submit', function (event) { event.preventDefault(); });
    dom.btnPlay.addEventListener('click', function () { options.onPlay(); });
    dom.btnClear.addEventListener('click', requestClear);
    // Les tableaux de données ne sont construits qu'à l'ouverture
    dom.evolutionDetails.addEventListener('toggle', function () {
      if (dom.evolutionDetails.open) renderEvolutionTable(currentSlices);
    });
    dom.activityDetails.addEventListener('toggle', function () {
      if (dom.activityDetails.open) renderActivityTable(currentDays);
    });
  }

  /* =======================================================
     Rendu complet
     ======================================================= */

  function render() {
    const games = Store.getGames();
    const hasGames = games.length > 0;
    dom.empty.hidden = hasGames;
    dom.content.hidden = !hasGames;
    dom.storageWarning.hidden = Store.isPersistent();
    dom.subtitle.textContent = hasGames
      ? Ui.pluralize(games.length, 'partie enregistrée', 'parties enregistrées') + ' depuis le ' + formatFullDay(games[0].date) + '.'
      : 'Vos statistiques apparaîtront ici après votre première partie.';
    if (!hasGames) return;

    const filter = { difficulty: dom.filterDifficulty.value, op: dom.filterOp.value };
    const slices = Stats.select(games, filter);
    currentSlices = slices;
    dom.filterEmpty.hidden = slices.length > 0;
    dom.body.hidden = slices.length === 0;
    if (slices.length === 0) return;

    renderKpis(slices);
    renderEvolution(slices);
    renderActivity(slices);
    renderOperations(games, filter);
    renderTiers(slices);
    renderGameLists(games, filter);
  }

  /* ---------- Tuiles de chiffres clés ---------- */

  function renderKpis(slices) {
    const all = Stats.summarize(slices);
    const compare = compareWindows(slices);
    const tiles = [
      {
        label: 'Parties',
        value: Ui.formatInteger(all.games),
        detail: Ui.pluralize(all.questions, 'question', 'questions')
      },
      {
        label: 'Réussite',
        value: all.rate === null ? '—' : Ui.formatPercent(all.rate),
        delta: compare && deltaFor(compare, 'rate')
      },
      {
        label: 'Temps moyen',
        value: all.avgMs === null ? '—' : Ui.formatSeconds(all.avgMs),
        detail: 'par question',
        delta: compare && deltaFor(compare, 'time')
      },
      {
        label: 'Note de rapidité',
        value: all.note === null ? '—' : Ui.formatNote(all.note) + ' / 20',
        delta: compare && deltaFor(compare, 'note')
      },
      {
        label: 'Meilleure série',
        value: all.bestStreak === null ? '—' : Ui.formatInteger(all.bestStreak),
        detail: 'bonnes réponses d\'affilée'
      },
      {
        label: 'Temps d\'entraînement',
        value: all.totalMs > 0 ? Ui.formatTotalTime(all.totalMs) : '—',
        detail: 'temps de réponse cumulé'
      }
    ];
    Ui.replaceChildren(dom.kpis, tiles.map(createKpi));

    const hasDelta = tiles.some(function (tile) { return tile.delta; });
    dom.kpiCompare.hidden = !hasDelta;
    if (hasDelta) {
      dom.kpiCompare.textContent = 'Flèches : vos ' + compare.size + ' dernières parties comparées aux ' +
        compare.size + ' précédentes.';
    }
  }

  function createKpi(tile) {
    const item = Ui.createElement('div', 'kpi', '');
    item.appendChild(Ui.createElement('dt', 'kpi-label', tile.label));
    item.appendChild(Ui.createElement('dd', 'kpi-value', tile.value));
    if (tile.delta) {
      const delta = Ui.createElement('dd', 'kpi-delta is-' + tile.delta.tone, '');
      const icon = Ui.createElement('span', 'kpi-delta-icon', tile.delta.icon);
      icon.setAttribute('aria-hidden', 'true');
      delta.appendChild(icon);
      delta.appendChild(document.createTextNode(' ' + tile.delta.text));
      if (tile.delta.srText) delta.appendChild(Ui.createElement('span', 'visually-hidden', ', ' + tile.delta.srText));
      item.appendChild(delta);
    } else if (tile.detail) {
      item.appendChild(Ui.createElement('dd', 'kpi-detail', tile.detail));
    }
    return item;
  }

  /** Les N dernières parties et les N d'avant (N ≤ 10), si l'on en a au moins 4. */
  function compareWindows(slices) {
    if (slices.length < 4) return null;
    const size = Math.min(COMPARE_WINDOW, Math.floor(slices.length / 2));
    return {
      size: size,
      recent: Stats.summarize(slices.slice(-size)),
      previous: Stats.summarize(slices.slice(-2 * size, -size))
    };
  }

  function deltaFor(compare, metric) {
    const def = DELTAS[metric];
    const recent = def.read(compare.recent);
    const previous = def.read(compare.previous);
    if (recent === null || previous === null) return null;
    const diff = recent - previous;
    const abs = Math.abs(diff);
    if (abs < def.threshold) return { icon: '=', text: 'stable', tone: 'neutral', srText: '' };
    const up = diff > 0;
    const good = up === def.higherIsBetter;
    return {
      icon: up ? '▲' : '▼',
      text: (up ? '+' : '−') + Ui.formatDecimal(abs) + ' ' + def.unit(abs),
      tone: good ? 'good' : 'bad',
      srText: good ? 'en progrès' : 'en recul'
    };
  }

  /* ---------- Évolution (trois courbes) ---------- */

  function renderEvolution(slices) {
    const title = function (i) { return 'Partie ' + (i + 1) + ' · ' + Ui.formatDate(slices[i].game.date); };
    const subtitle = function (i) { return Ui.formatConfigLabel(slices[i].game); };
    EVOLUTION_CHARTS.forEach(function (def) {
      const values = Stats.evolution(slices, def.metric).map(function (point) { return point.value; });
      const hasData = values.some(function (value) { return value !== null; });
      const container = dom[def.chartId];
      container.hidden = !hasData;
      dom[def.emptyId].hidden = hasData;
      if (!hasData) return;
      Charts.mount(container, 'line', {
        label: def.label + ', ' + Ui.pluralize(slices.length, 'partie', 'parties'),
        height: 170,
        scale: def.scale,
        format: def.format,
        formatTick: def.formatTick,
        series: [
          { key: 'raw', label: 'cette partie', values: values },
          {
            key: 'avg',
            label: 'moyenne sur ' + MOVING_AVERAGE + ' parties',
            values: Stats.movingAverage(values, MOVING_AVERAGE)
          }
        ],
        pointTitle: title,
        pointSubtitle: subtitle
      });
    });
    if (dom.evolutionDetails.open) renderEvolutionTable(slices);
  }

  /** Vue tableau des courbes : une ligne par partie, la plus récente en premier. */
  function renderEvolutionTable(slices) {
    const rows = slices.map(function (slice, i) {
      const row = document.createElement('tr');
      const note = slice.pts === null ? null : Stats.speedNote(slice.pts, slice.c);
      row.appendChild(Ui.createElement('td', '', String(i + 1)));
      row.appendChild(Ui.createElement('td', '', Ui.formatDate(slice.game.date)));
      row.appendChild(Ui.createElement('td', 'is-text', Ui.formatConfigLabel(slice.game)));
      row.appendChild(Ui.createElement('td', '', Ui.formatPercent(slice.c / slice.n)));
      row.appendChild(Ui.createElement('td', '', slice.ms === null ? '—' : Ui.formatSeconds(slice.ms / slice.n)));
      row.appendChild(Ui.createElement('td', '', note === null ? '—' : Ui.formatNote(note)));
      return row;
    }).reverse();
    Ui.replaceChildren(dom.evolutionBody, rows);
  }

  /* ---------- Activité (30 derniers jours) ---------- */

  function renderActivity(slices) {
    const days = Stats.activity(slices, ACTIVITY_DAYS, new Date());
    currentDays = days;
    const active = days.filter(function (day) { return day.questions > 0; });
    const questions = active.reduce(function (sum, day) { return sum + day.questions; }, 0);
    const hasActivity = active.length > 0;
    dom.activityChart.hidden = !hasActivity;
    dom.activityDetails.hidden = !hasActivity;
    dom.activityEmpty.hidden = hasActivity;
    dom.activitySummary.textContent = hasActivity
      ? Ui.pluralize(questions, 'question', 'questions') + ' en ' +
        Ui.pluralize(active.length, 'jour actif', 'jours actifs') + ' sur les ' + ACTIVITY_DAYS + ' derniers jours.'
      : '';
    if (!hasActivity) return;

    Charts.mount(dom.activityChart, 'columns', {
      label: 'Questions par jour sur les ' + ACTIVITY_DAYS + ' derniers jours',
      height: 180,
      formatTick: Ui.formatInteger,
      items: days.map(function (day) {
        return { value: day.questions, shortLabel: Ui.formatShortDay(day.date) };
      }),
      describe: function (i) {
        const day = days[i];
        return {
          title: capitalize(Ui.formatLongDay(day.date)),
          rows: [
            { value: Ui.formatInteger(day.questions), label: day.questions > 1 ? 'questions' : 'question' },
            { value: Ui.formatInteger(day.games), label: day.games > 1 ? 'parties' : 'partie' }
          ]
        };
      }
    });
    if (dom.activityDetails.open) renderActivityTable(days);
  }

  function renderActivityTable(days) {
    const rows = days.filter(function (day) { return day.questions > 0; }).reverse().map(function (day) {
      const row = document.createElement('tr');
      row.appendChild(Ui.createElement('td', 'is-text', capitalize(Ui.formatLongDay(day.date))));
      row.appendChild(Ui.createElement('td', '', Ui.formatInteger(day.games)));
      row.appendChild(Ui.createElement('td', '', Ui.formatInteger(day.questions)));
      return row;
    });
    Ui.replaceChildren(dom.activityBody, rows);
  }

  /* ---------- Par opération ---------- */

  function renderOperations(games, filter) {
    const rows = Stats.byOperation(games, filter).filter(function (row) { return row.avgMs !== null; });
    dom.opsTable.hidden = rows.length === 0;
    dom.opsEmpty.hidden = rows.length > 0;
    Ui.replaceChildren(dom.opsBody, rows.map(createOperationRow));
  }

  function createOperationRow(row) {
    const operation = Generator.OPERATIONS[row.op];
    const tr = document.createElement('tr');

    const name = Ui.createElement('th', 'ops-name', '');
    name.setAttribute('scope', 'row');
    const symbol = Ui.createElement('span', 'ops-symbol', operation.symbol);
    symbol.setAttribute('aria-hidden', 'true');
    name.appendChild(symbol);
    name.appendChild(Ui.createElement('span', 'ops-label', operation.label));
    tr.appendChild(name);

    tr.appendChild(Ui.createElement('td', 'ops-count', Ui.formatInteger(row.questions)));

    const rate = Ui.createElement('td', 'ops-rate', '');
    const meter = Ui.createElement('span', 'meter', '');
    meter.setAttribute('aria-hidden', 'true');
    const fill = Ui.createElement('span', 'meter-fill', '');
    fill.style.width = (row.rate * 100).toFixed(1) + '%';
    meter.appendChild(fill);
    rate.appendChild(Ui.createElement('span', 'ops-rate-value', Ui.formatPercent(row.rate)));
    rate.appendChild(meter);
    tr.appendChild(rate);

    tr.appendChild(Ui.createElement('td', '', Ui.formatSeconds(row.avgMs)));
    tr.appendChild(Ui.createElement('td', '', row.note === null ? '—' : Ui.formatNote(row.note)));
    return tr;
  }

  /* ---------- Répartition des temps ---------- */

  function renderTiers(slices) {
    const counts = Stats.tierCounts(slices);
    const total = counts.reduce(function (sum, n) { return sum + n; }, 0);
    dom.tiers.hidden = total === 0;
    dom.tiersNote.hidden = total === 0;
    dom.tiersEmpty.hidden = total > 0;
    if (total === 0) return;
    Charts.renderTierBars(dom.tiers, counts);
    dom.tiersNote.textContent = 'Sur ' +
      Ui.pluralize(total, 'bonne réponse chronométrée', 'bonnes réponses chronométrées') + '.';
  }

  /* ---------- Records et dernières parties ---------- */

  function renderGameLists(games, filter) {
    const matching = games.filter(function (game) {
      return (filter.difficulty === 'all' || game.difficulty === filter.difficulty) &&
        (filter.op === 'all' || game.operations.indexOf(filter.op) !== -1);
    });
    renderList(dom.recordsList, dom.recordsEmpty, Stats.records(matching), createRecordItem);
    renderList(dom.historyList, dom.historyEmpty, matching.slice(-RECENT_LIMIT).reverse(), createGameItem);
  }

  function renderList(list, empty, items, createItem) {
    Ui.replaceChildren(list, items.map(createItem));
    list.hidden = items.length === 0;
    empty.hidden = items.length > 0;
  }

  function createRecordItem(game) {
    const parts = ['Le ' + Ui.formatDate(game.date)];
    const avg = Stats.averageMs(game);
    if (avg !== null) parts.push(Ui.formatSeconds(avg) + ' en moyenne');
    return createListItem(Ui.formatConfigLabel(game), parts.join(' · '), Ui.formatRecordScore(game));
  }

  function createGameItem(game) {
    const parts = [Ui.formatDate(game.date)];
    const avg = Stats.averageMs(game);
    if (avg !== null) parts.push(Ui.formatSeconds(avg) + ' par question');
    const note = gameNote(game);
    if (note !== null) parts.push('rapidité ' + Ui.formatNote(note) + ' / 20');
    return createListItem(Ui.formatConfigLabel(game), parts.join(' · '), game.correct + ' / ' + game.total);
  }

  function gameNote(game) {
    const totals = Stats.totalsOf(game);
    return totals.pts === null ? null : Stats.speedNote(totals.pts, totals.c);
  }

  function createListItem(title, meta, score) {
    const item = Ui.createElement('li', 'list-item', '');
    const main = Ui.createElement('div', 'list-main', '');
    main.appendChild(Ui.createElement('p', 'list-title', title));
    main.appendChild(Ui.createElement('p', 'list-meta', meta));
    item.appendChild(main);
    item.appendChild(Ui.createElement('p', 'list-score', score));
    return item;
  }

  /* ---------- Effacement ---------- */

  function requestClear() {
    options.confirm({
      title: 'Effacer les statistiques ?',
      message: 'Toutes les parties enregistrées, les records et les graphiques seront supprimés. Cette action est irréversible.',
      confirmLabel: 'Effacer',
      cancelLabel: 'Annuler',
      danger: true,
      focus: 'cancel'
    }, function (confirmed) {
      if (!confirmed) return;
      Store.clearGames();
      render();
      dom.title.focus();
    });
  }

  /* ---------- Outils ---------- */

  function formatFullDay(iso) {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  return { init: init, render: render };
})();
