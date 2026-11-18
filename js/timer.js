/* =========================================================
   timer.js — Compte à rebours fluide (requestAnimationFrame)
   ---------------------------------------------------------
   Un seul compte à rebours existe à la fois : start() arrête
   toujours le précédent, stop() annule la frame en attente.
   Avec une durée de 0 (temps illimité), aucune frame n'est
   programmée : le timer sert uniquement de chronomètre.
   ========================================================= */

const Timer = (function () {
  'use strict';

  const timer = {
    status: 'idle',     // 'idle' | 'running' | 'paused'
    durationMs: 0,      // 0 = pas de limite
    startedAt: 0,       // performance.now() au dernier démarrage / reprise
    elapsedBefore: 0,   // temps écoulé avant la dernière pause
    rafId: null,
    onTick: null,
    onExpire: null
  };

  function now() {
    return performance.now();
  }

  /** Temps écoulé (ms) depuis start(), pauses exclues. Figé après stop(). */
  function elapsed() {
    const running = timer.status === 'running' ? now() - timer.startedAt : 0;
    return timer.elapsedBefore + running;
  }

  /**
   * Démarre un compte à rebours.
   * @param {number}   durationMs  durée en ms (0 = illimité)
   * @param {Function} onTick      appelée à chaque frame : (restantMs, ratio 0→1)
   * @param {Function} onExpire    appelée une seule fois quand le temps est écoulé
   */
  function start(durationMs, onTick, onExpire) {
    stop();
    timer.durationMs = durationMs > 0 ? durationMs : 0;
    timer.onTick = onTick || null;
    timer.onExpire = onExpire || null;
    timer.elapsedBefore = 0;
    run();
  }

  function run() {
    timer.status = 'running';
    timer.startedAt = now();
    scheduleFrame();
  }

  function pause() {
    if (timer.status !== 'running') return;
    timer.elapsedBefore = elapsed();
    timer.status = 'paused';
    cancelFrame();
  }

  function resume() {
    if (timer.status === 'paused') run();
  }

  /** Arrête tout : plus aucune frame ni callback ne sera exécuté. */
  function stop() {
    if (timer.status === 'running') timer.elapsedBefore = elapsed();
    timer.status = 'idle';
    timer.onTick = null;
    timer.onExpire = null;
    cancelFrame();
  }

  function scheduleFrame() {
    if (timer.durationMs > 0 && timer.rafId === null) {
      timer.rafId = window.requestAnimationFrame(onFrame);
    }
  }

  function cancelFrame() {
    if (timer.rafId !== null) {
      window.cancelAnimationFrame(timer.rafId);
      timer.rafId = null;
    }
  }

  function onFrame() {
    timer.rafId = null;
    if (timer.status !== 'running') return;

    const remaining = Math.max(0, timer.durationMs - elapsed());
    if (timer.onTick) timer.onTick(remaining, remaining / timer.durationMs);
    if (remaining > 0) {
      scheduleFrame();
      return;
    }
    const onExpire = timer.onExpire;
    stop();
    if (onExpire) onExpire();
  }

  /** true tant qu'un compte à rebours est en cours ou en pause. */
  function isActive() {
    return timer.status !== 'idle' || timer.rafId !== null;
  }

  return { start: start, pause: pause, resume: resume, stop: stop, elapsed: elapsed, isActive: isActive };
})();
