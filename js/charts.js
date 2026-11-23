/* =========================================================
   charts.js — Graphiques SVG du profil (sans bibliothèque)
   ---------------------------------------------------------
   - courbe (line) : une valeur par partie, avec réticule
     vertical et info-bulle qui suivent la souris ;
   - colonnes (columns) : une valeur par jour, info-bulle
     sur chaque colonne ;
   - barres de paliers (renderTierBars) : liste HTML simple.
   Les couleurs viennent des variables CSS (--chart-*) : le
   changement de thème ne demande aucun redessin.
   Au clavier : Tab pour atteindre le graphique, flèches
   gauche / droite pour parcourir, Début / Fin, Échap.
   Le graphique se redessine quand sa largeur change.
   Dépend de : Ui (ui.js), Stats (stats.js).
   ========================================================= */

const Charts = (function () {
  'use strict';

  const MIN_TICK_GAP = 64; // écart minimal (px) entre deux étiquettes de l'axe horizontal
  const DOT_RADIUS = 4;
  const TYPES = {};
  let observer = null;
  const fallbackContainers = [];

  /* =======================================================
     Montage et redimensionnement
     ======================================================= */

  /**
   * Dessine (ou redessine) un graphique dans `container`.
   * @param {string} type  'line' ou 'columns'
   * @param {object} spec  données et textes (voir TYPES.line / TYPES.columns)
   */
  function mount(container, type, spec) {
    if (!container._chartReady) setup(container);
    container._chart = { type: type, spec: spec, geom: null, index: null, width: -1 };
    container.setAttribute('aria-label', spec.label + '. Flèches gauche et droite pour parcourir les valeurs.');
    container._live.textContent = '';
    draw(container);
  }

  function setup(container) {
    container._chartReady = true;
    container.classList.add('chart');
    container.tabIndex = 0;
    container.setAttribute('role', 'group');
    container.setAttribute('aria-roledescription', 'graphique');

    container._tooltip = Ui.createElement('div', 'chart-tooltip', '');
    container._tooltip.hidden = true;
    container._tooltip.setAttribute('aria-hidden', 'true');
    container._live = Ui.createElement('p', 'visually-hidden', '');
    container._live.setAttribute('aria-live', 'polite');
    container.appendChild(container._tooltip);
    container.appendChild(container._live);

    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerdown', onPointerMove);
    container.addEventListener('pointerleave', onPointerLeave);
    container.addEventListener('keydown', onKeydown);
    container.addEventListener('focus', onFocus);
    container.addEventListener('blur', onBlur);
    watch(container);
  }

  function watch(container) {
    if (typeof ResizeObserver === 'function') {
      if (!observer) {
        observer = new ResizeObserver(function (entries) {
          entries.forEach(function (entry) { redrawIfResized(entry.target); });
        });
      }
      observer.observe(container);
      return;
    }
    if (fallbackContainers.length === 0) {
      window.addEventListener('resize', function () { fallbackContainers.forEach(redrawIfResized); });
    }
    fallbackContainers.push(container);
  }

  function redrawIfResized(container) {
    if (container._chart && container.clientWidth !== container._chart.width) draw(container);
  }

  function draw(container) {
    const chart = container._chart;
    chart.width = container.clientWidth;
    if (container._svg) {
      container.removeChild(container._svg);
      container._svg = null;
    }
    chart.geom = null;
    if (chart.width === 0) return; // écran masqué : dessiné dès qu'il réapparaît
    const result = TYPES[chart.type].render(chart.spec, chart.width);
    container._svg = result.svg;
    container.insertBefore(result.svg, container.firstChild);
    chart.geom = result.geom;
    if (chart.index !== null && chart.index < chart.geom.count) show(container, chart.index, false);
    else hide(container);
  }

  /* =======================================================
     Survol, toucher et clavier
     ======================================================= */

  function onPointerMove(event) {
    const container = event.currentTarget;
    const chart = container._chart;
    if (!chart || !chart.geom || chart.geom.count === 0) return;
    const rect = container.getBoundingClientRect();
    const index = TYPES[chart.type].indexAt(chart.geom, event.clientX - rect.left);
    if (index === null) {
      if (event.pointerType === 'mouse') hide(container);
      return;
    }
    if (index !== chart.index || container._tooltip.hidden) show(container, index, false);
  }

  /** Souris : l'info-bulle suit le pointeur. Toucher : elle reste jusqu'au toucher suivant ailleurs. */
  function onPointerLeave(event) {
    if (event.pointerType === 'mouse') hide(event.currentTarget);
  }

  function onKeydown(event) {
    const container = event.currentTarget;
    const chart = container._chart;
    if (!chart || !chart.geom || chart.geom.count === 0) return;
    const last = chart.geom.count - 1;
    let next;
    if (event.key === 'ArrowLeft') next = chart.index === null ? last : Math.max(0, chart.index - 1);
    else if (event.key === 'ArrowRight') next = chart.index === null ? last : Math.min(last, chart.index + 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else if (event.key === 'Escape' && chart.index !== null) {
      event.preventDefault();
      hide(container);
      return;
    } else return;
    event.preventDefault();
    show(container, next, true);
  }

  /** Au clavier, l'arrivée sur le graphique affiche directement la dernière valeur. */
  function onFocus(event) {
    const container = event.currentTarget;
    const chart = container._chart;
    if (!chart || !chart.geom || chart.geom.count === 0 || !isFocusVisible(container)) return;
    show(container, chart.index === null ? chart.geom.count - 1 : chart.index, true);
  }

  function onBlur(event) {
    hide(event.currentTarget);
  }

  function isFocusVisible(element) {
    try {
      return element.matches(':focus-visible');
    } catch (error) {
      return true;
    }
  }

  function show(container, index, announce) {
    const chart = container._chart;
    const type = TYPES[chart.type];
    chart.index = index;
    type.highlight(chart.geom, index);
    container.classList.add('is-hovering');
    const info = type.describe(chart.spec, index);
    fillTooltip(container._tooltip, info);
    container._tooltip.hidden = false;
    placeTooltip(container, type.anchorX(chart.geom, index));
    if (announce) container._live.textContent = describeText(info);
  }

  function hide(container) {
    const chart = container._chart;
    if (chart) {
      chart.index = null;
      if (chart.geom) TYPES[chart.type].highlight(chart.geom, null);
    }
    container.classList.remove('is-hovering');
    container._tooltip.hidden = true;
  }

  /** Valeurs en premier (en gras), libellés ensuite. Textes insérés avec textContent. */
  function fillTooltip(tooltip, info) {
    const children = [Ui.createElement('p', 'chart-tooltip-title', info.title)];
    if (info.subtitle) children.push(Ui.createElement('p', 'chart-tooltip-sub', info.subtitle));
    const list = Ui.createElement('ul', 'chart-tooltip-rows', '');
    info.rows.forEach(function (row) {
      const item = Ui.createElement('li', 'chart-tooltip-row', '');
      if (row.key) item.appendChild(Ui.createElement('span', 'chart-key chart-key--' + row.key, ''));
      item.appendChild(Ui.createElement('strong', 'chart-tooltip-value', row.value));
      item.appendChild(Ui.createElement('span', 'chart-tooltip-label', row.label));
      list.appendChild(item);
    });
    children.push(list);
    Ui.replaceChildren(tooltip, children);
  }

  function describeText(info) {
    const rows = info.rows.map(function (row) { return row.value + ' ' + row.label; });
    return [info.title].concat(info.subtitle ? [info.subtitle] : [], rows).join(', ');
  }

  /** À droite du point survolé, ou à gauche s'il n'y a pas la place. */
  function placeTooltip(container, x) {
    const tooltip = container._tooltip;
    const width = container.clientWidth;
    const tipWidth = tooltip.offsetWidth;
    let left = x + 14;
    if (left + tipWidth > width) left = x - 14 - tipWidth;
    left = Math.max(0, Math.min(left, width - tipWidth));
    tooltip.style.left = Math.round(left) + 'px';
  }

  /* =======================================================
     Échelles et axes
     ======================================================= */

  /** Pas « rond » (1, 2, 2,5, 5 × 10^n) ; sans 2,5 pour des nombres entiers. */
  function niceStep(raw, integer) {
    if (!(raw > 0)) return 1;
    const power = Math.pow(10, Math.floor(Math.log10(raw)));
    const fraction = raw / power;
    let nice;
    if (fraction <= 1) nice = 1;
    else if (fraction <= 2) nice = 2;
    else if (fraction <= 2.5 && !integer) nice = 2.5;
    else if (fraction <= 5) nice = 5;
    else nice = 10;
    return integer ? Math.max(1, Math.round(nice * power)) : nice * power;
  }

  /** Échelle de 0 à un maximum arrondi, avec environ `tickCount` intervalles. */
  function niceScale(max, tickCount, integer) {
    const step = niceStep((max > 0 ? max : 1) / tickCount, integer);
    const top = Math.max(step, Math.ceil(max / step - 1e-9) * step);
    const ticks = [];
    for (let value = 0; value <= top + step / 2; value += step) ticks.push(Math.round(value * 1000) / 1000);
    return { max: top, ticks: ticks };
  }

  /** Graduations horizontales : grille fine, ligne de base, étiquettes à gauche. */
  function drawYAxis(svg, scale, yOf, left, right, formatTick) {
    scale.ticks.forEach(function (tick) {
      const y = Math.round(yOf(tick)) + 0.5;
      svg.appendChild(Ui.createSvg('line', {
        class: tick === 0 ? 'chart-axis' : 'chart-grid', x1: left, x2: right, y1: y, y2: y
      }));
      const label = Ui.createSvg('text', {
        class: 'chart-tick', x: left - 8, y: y, 'text-anchor': 'end', 'dominant-baseline': 'middle'
      });
      label.textContent = formatTick(tick);
      svg.appendChild(label);
    });
  }

  function drawXLabel(svg, x, y, text) {
    const label = Ui.createSvg('text', { class: 'chart-tick', x: x, y: y, 'text-anchor': 'middle' });
    label.textContent = text;
    svg.appendChild(label);
  }

  function createSvgRoot(width, height) {
    return Ui.createSvg('svg', {
      class: 'chart-svg', width: width, height: height, viewBox: '0 0 ' + width + ' ' + height,
      'aria-hidden': 'true', focusable: 'false'
    });
  }

  /* =======================================================
     Courbe : une valeur par partie
     spec = {
       label, height,
       scale: { max, ticks } ou null (automatique),
       format(valeur), formatTick(valeur),
       series: [{ key: 'raw' | 'avg', label, values: [nombre | null] }],
       pointTitle(index), pointSubtitle(index)
     }
     La dernière série est mise en avant (couleur, valeur finale écrite).
     ======================================================= */

  TYPES.line = {
    render: function (spec, width) {
      const height = spec.height || 170;
      const margin = { top: 10, right: 58, bottom: 26, left: 46 };
      const plotW = Math.max(10, width - margin.left - margin.right);
      const plotH = height - margin.top - margin.bottom;
      const count = spec.series[0].values.length;
      const scale = spec.scale || niceScale(maxOf(spec.series), 4, false);
      const xOf = function (i) {
        return margin.left + (count <= 1 ? plotW / 2 : (i / (count - 1)) * plotW);
      };
      const yOf = function (value) {
        return margin.top + plotH - (Math.min(value, scale.max) / scale.max) * plotH;
      };
      const svg = createSvgRoot(width, height);

      drawYAxis(svg, scale, yOf, margin.left, margin.left + plotW, spec.formatTick);
      indexTicks(count, plotW).forEach(function (i) {
        drawXLabel(svg, xOf(i), margin.top + plotH + 18, String(i + 1));
      });

      spec.series.forEach(function (series) {
        drawSeries(svg, series, count, xOf, yOf);
      });
      drawEndLabel(svg, spec.series[spec.series.length - 1], xOf, yOf, spec.format);

      // Éléments de survol, masqués tant que rien n'est survolé
      const crosshair = Ui.createSvg('line', {
        class: 'chart-crosshair', x1: 0, x2: 0, y1: margin.top, y2: margin.top + plotH, visibility: 'hidden'
      });
      svg.appendChild(crosshair);
      const hoverDots = spec.series.map(function (series) {
        const dot = Ui.createSvg('circle', {
          class: 'chart-dot chart-dot--' + series.key, r: DOT_RADIUS + 1, cx: 0, cy: 0, visibility: 'hidden'
        });
        svg.appendChild(dot);
        return dot;
      });

      return {
        svg: svg,
        geom: {
          count: count, margin: margin, plotW: plotW, xOf: xOf, yOf: yOf,
          crosshair: crosshair, hoverDots: hoverDots,
          values: spec.series.map(function (series) { return series.values; })
        }
      };
    },

    /** Le réticule s'aligne sur la partie la plus proche du pointeur. */
    indexAt: function (geom, x) {
      if (geom.count === 1) return 0;
      const ratio = (x - geom.margin.left) / geom.plotW;
      return Math.max(0, Math.min(geom.count - 1, Math.round(ratio * (geom.count - 1))));
    },

    highlight: function (geom, index) {
      const visible = index !== null;
      geom.crosshair.setAttribute('visibility', visible ? 'visible' : 'hidden');
      if (visible) {
        const x = Math.round(geom.xOf(index)) + 0.5;
        geom.crosshair.setAttribute('x1', x);
        geom.crosshair.setAttribute('x2', x);
      }
      geom.hoverDots.forEach(function (dot, s) {
        const value = visible ? geom.values[s][index] : null;
        dot.setAttribute('visibility', value === null ? 'hidden' : 'visible');
        if (value === null) return;
        dot.setAttribute('cx', geom.xOf(index).toFixed(1));
        dot.setAttribute('cy', geom.yOf(value).toFixed(1));
      });
    },

    /** Info-bulle : toutes les séries à cette partie, la série mise en avant d'abord. */
    describe: function (spec, index) {
      const rows = spec.series.slice().reverse().map(function (series) {
        const value = series.values[index];
        return { key: series.key, value: value === null ? '—' : spec.format(value), label: series.label };
      });
      return { title: spec.pointTitle(index), subtitle: spec.pointSubtitle(index), rows: rows };
    },

    anchorX: function (geom, index) {
      return geom.xOf(index);
    }
  };

  function maxOf(seriesList) {
    let max = 0;
    seriesList.forEach(function (series) {
      series.values.forEach(function (value) {
        if (value !== null && value > max) max = value;
      });
    });
    return max;
  }

  /** Numéros de partie affichés sous l'axe : 1, puis des multiples d'un pas rond. */
  function indexTicks(count, plotW) {
    if (count <= 1) return count === 1 ? [0] : [];
    const maxLabels = Math.max(2, Math.floor(plotW / MIN_TICK_GAP) + 1);
    const step = niceStep((count - 1) / (maxLabels - 1), true);
    const ticks = [0];
    for (let number = step; number <= count; number += step) {
      if (number - 1 >= step / 2) ticks.push(number - 1);
    }
    return ticks;
  }

  /** Trait coupé là où la valeur manque ; point visible si la valeur est isolée. */
  function drawSeries(svg, series, count, xOf, yOf) {
    const values = series.values;
    let d = '';
    let open = false;
    values.forEach(function (value, i) {
      if (value === null) {
        open = false;
        return;
      }
      d += (open ? 'L' : 'M') + xOf(i).toFixed(1) + ',' + yOf(value).toFixed(1);
      open = true;
    });
    if (d) svg.appendChild(Ui.createSvg('path', { class: 'chart-line chart-line--' + series.key, d: d }));

    const showAll = series.key === 'raw' && count <= 15;
    values.forEach(function (value, i) {
      if (value === null) return;
      const isolated = (i === 0 || values[i - 1] === null) && (i === count - 1 || values[i + 1] === null);
      if (!showAll && !isolated) return;
      svg.appendChild(Ui.createSvg('circle', {
        class: 'chart-dot chart-dot--' + series.key, r: DOT_RADIUS,
        cx: xOf(i).toFixed(1), cy: yOf(value).toFixed(1)
      }));
    });
  }

  /** Point final + valeur écrite au bout de la série mise en avant. */
  function drawEndLabel(svg, series, xOf, yOf, format) {
    let last = series.values.length - 1;
    while (last >= 0 && series.values[last] === null) last -= 1;
    if (last < 0) return;
    const value = series.values[last];
    const x = xOf(last);
    const y = yOf(value);
    svg.appendChild(Ui.createSvg('circle', {
      class: 'chart-dot chart-dot--' + series.key, r: DOT_RADIUS, cx: x.toFixed(1), cy: y.toFixed(1)
    }));
    const label = Ui.createSvg('text', {
      class: 'chart-end-label', x: (x + 9).toFixed(1), y: y.toFixed(1), 'dominant-baseline': 'middle'
    });
    label.textContent = format(value);
    svg.appendChild(label);
  }

  /* =======================================================
     Colonnes : une valeur par jour
     spec = {
       label, height, formatTick(valeur),
       items: [{ value, shortLabel }],
       describe(index) → { title, rows: [{ value, label }] }
     }
     ======================================================= */

  TYPES.columns = {
    render: function (spec, width) {
      const height = spec.height || 180;
      const margin = { top: 12, right: 8, bottom: 26, left: 40 };
      const plotW = Math.max(10, width - margin.left - margin.right);
      const plotH = height - margin.top - margin.bottom;
      const count = spec.items.length;
      const band = plotW / count;
      const barW = Math.max(2, Math.min(24, band - Math.max(2, band * 0.3)));
      const max = spec.items.reduce(function (m, item) { return Math.max(m, item.value); }, 0);
      const scale = niceScale(max, 3, true);
      const base = margin.top + plotH;
      const yOf = function (value) { return base - (value / scale.max) * plotH; };
      const centerOf = function (i) { return margin.left + band * (i + 0.5); };
      const svg = createSvgRoot(width, height);

      // Bande grisée derrière la colonne survolée (utile aussi pour les jours à 0)
      const hoverBand = Ui.createSvg('rect', {
        class: 'chart-band', x: 0, y: margin.top, width: band, height: plotH, visibility: 'hidden'
      });
      svg.appendChild(hoverBand);
      drawYAxis(svg, scale, yOf, margin.left, margin.left + plotW, spec.formatTick);

      const bars = spec.items.map(function (item, i) {
        if (!(item.value > 0)) return null;
        const h = Math.max(1, base - yOf(item.value));
        const bar = Ui.createSvg('path', {
          class: 'chart-bar', d: columnPath(centerOf(i) - barW / 2, base - h, barW, h, 4)
        });
        svg.appendChild(bar);
        return bar;
      });

      // Étiquettes de dates, alignées sur le dernier jour (aujourd'hui)
      const step = Math.max(1, Math.ceil(MIN_TICK_GAP / band));
      for (let i = count - 1; i >= 0; i -= step) {
        drawXLabel(svg, centerOf(i), base + 18, spec.items[i].shortLabel);
      }

      return {
        svg: svg,
        geom: { count: count, margin: margin, band: band, centerOf: centerOf, bars: bars, hoverBand: hoverBand }
      };
    },

    indexAt: function (geom, x) {
      const index = Math.floor((x - geom.margin.left) / geom.band);
      return index < 0 || index >= geom.count ? null : index;
    },

    highlight: function (geom, index) {
      geom.bars.forEach(function (bar, i) {
        if (bar) bar.classList.toggle('is-active', i === index);
      });
      geom.hoverBand.setAttribute('visibility', index === null ? 'hidden' : 'visible');
      if (index !== null) geom.hoverBand.setAttribute('x', (geom.centerOf(index) - geom.band / 2).toFixed(1));
    },

    describe: function (spec, index) {
      return spec.describe(index);
    },

    anchorX: function (geom, index) {
      return geom.centerOf(index) + geom.band / 2;
    }
  };

  /** Colonne au sommet arrondi (4 px), carrée sur la ligne de base. */
  function columnPath(x, y, w, h, radius) {
    const r = Math.min(radius, w / 2, h);
    const f = function (n) { return n.toFixed(1); };
    return 'M' + f(x) + ',' + f(y + h) +
      'V' + f(y + r) +
      'A' + f(r) + ',' + f(r) + ' 0 0 1 ' + f(x + r) + ',' + f(y) +
      'H' + f(x + w - r) +
      'A' + f(r) + ',' + f(r) + ' 0 0 1 ' + f(x + w) + ',' + f(y + r) +
      'V' + f(y + h) + 'Z';
  }

  /* =======================================================
     Répartition par palier du barème (HTML, chiffres écrits)
     ======================================================= */

  function renderTierBars(list, counts) {
    const total = counts.reduce(function (sum, n) { return sum + n; }, 0);
    const rows = Stats.TIERS.map(function (tier, i) {
      const share = total > 0 ? counts[i] / total : 0;
      const row = Ui.createElement('li', 'tier-row', '');

      const name = Ui.createElement('span', 'tier-name', tier.label);
      name.appendChild(Ui.createElement('span', 'tier-limit', tier.limit + ' · ' + tier.points + ' pts'));

      const track = Ui.createElement('span', 'tier-track', '');
      const bar = Ui.createElement('span', 'tier-bar', '');
      bar.style.width = (share * 100).toFixed(2) + '%';
      bar.hidden = counts[i] === 0;
      track.appendChild(bar);

      const value = Ui.createElement('span', 'tier-value', Ui.formatInteger(counts[i]));
      value.appendChild(Ui.createElement('span', 'visually-hidden',
        counts[i] > 1 ? ' bonnes réponses, ' : ' bonne réponse, '));
      value.appendChild(Ui.createElement('span', 'tier-share', Ui.formatPercent(share)));

      row.appendChild(name);
      row.appendChild(track);
      row.appendChild(value);
      return row;
    });
    Ui.replaceChildren(list, rows);
  }

  return {
    mount: mount,
    renderTierBars: renderTierBars,
    niceScale: niceScale
  };
})();
