/* =========================================================
   timer.js — Chronomètre discret
   ---------------------------------------------------------
   Il n'y a pas de temps imparti : le chronomètre mesure en
   arrière-plan le temps mis pour répondre à chaque question.
   Aucune animation ni minuterie n'est programmée : le temps
   est calculé à la demande avec performance.now().
   ========================================================= */

const Timer = (function () {
  'use strict';

  const timer = {
    status: 'idle',   // 'idle' | 'running' | 'paused'
    startedAt: 0,     // performance.now() au dernier démarrage / reprise
    elapsedBefore: 0  // temps cumulé avant la dernière pause
  };

  function now() {
    return performance.now();
  }

  /** Temps écoulé (ms) depuis start(), pauses exclues. Figé après stop(). */
  function elapsed() {
    const running = timer.status === 'running' ? now() - timer.startedAt : 0;
    return timer.elapsedBefore + running;
  }

  /** Remet à zéro et démarre. */
  function start() {
    timer.elapsedBefore = 0;
    timer.status = 'running';
    timer.startedAt = now();
  }

  function pause() {
    if (timer.status !== 'running') return;
    timer.elapsedBefore = elapsed();
    timer.status = 'paused';
  }

  function resume() {
    if (timer.status !== 'paused') return;
    timer.status = 'running';
    timer.startedAt = now();
  }

  /** Arrête et fige le temps écoulé. */
  function stop() {
    timer.elapsedBefore = elapsed();
    timer.status = 'idle';
  }

  /** true tant que le chronomètre tourne ou est en pause. */
  function isActive() {
    return timer.status !== 'idle';
  }

  return { start: start, pause: pause, resume: resume, stop: stop, elapsed: elapsed, isActive: isActive };
})();
