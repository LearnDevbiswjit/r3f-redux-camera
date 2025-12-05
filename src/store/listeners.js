// src/store/listeners.js
import { createListenerMiddleware } from '@reduxjs/toolkit';
import { setPhase, setOverallProgress } from './slices/timelineSlice';
import { setMode, setProgress, lockCamera, unlockCamera, setLastCommand } from './slices/cameraSlice';

/*
  listenerMiddleware:
  - maps overallProgress -> phases (theatreA / helix / theatreB)
  - sets camera.mode accordingly and commands registry
  - uses registry.seekTimelineNormalized('theatreA'|'theatreB', local) for theatre phases
*/

export const listenerMiddleware = createListenerMiddleware();

let prevOverall = null;
let prevPhase = null;

listenerMiddleware.startListening({
  actionCreator: setOverallProgress,
  effect: async (action, listenerApi) => {
    const p = action.payload;
    if (prevOverall != null && Math.abs(prevOverall - p) < 1e-6) return;
    prevOverall = p;

    const state = listenerApi.getState();
    const d = state.timeline.durations || { theatreA: 20 * 60, helix: 20 * 60, theatreB: 30 * 60 };
    const total = Math.max(1, d.theatreA + d.helix + d.theatreB);
    const tA = d.theatreA / total;
    const tH = d.helix / total;
    // tB = remainder

    const registry = (typeof window !== 'undefined' && window.__TimelineRegistry__) ? window.__TimelineRegistry__ : null;

    if (p <= tA) {
      // theatreA phase
      const local = tA === 0 ? 0 : (p / tA);
      if (prevPhase !== 'theatreA') {
        listenerApi.dispatch(setPhase('theatreA'));
        listenerApi.dispatch(lockCamera());
        listenerApi.dispatch(setMode('theatre'));
        prevPhase = 'theatreA';
      }
      registry?.seekTimelineNormalized?.('theatreA', local);
    } else if (p > tA && p <= tA + tH) {
      // helix phase
      const local = (p - tA) / tH;
      if (prevPhase !== 'helix') {
        listenerApi.dispatch(setPhase('helix'));
        listenerApi.dispatch(unlockCamera());
        listenerApi.dispatch(setMode('helix'));
        prevPhase = 'helix';
      }
      listenerApi.dispatch(setProgress(local));
    } else {
      // theatreB phase
      const start = tA + tH;
      const local = (p - start) / (1 - start);
      if (prevPhase !== 'theatreB') {
        listenerApi.dispatch(setPhase('theatreB'));
        listenerApi.dispatch(lockCamera());
        listenerApi.dispatch(setMode('theatre'));
        prevPhase = 'theatreB';
      }
      registry?.seekTimelineNormalized?.('theatreB', local);
    }

    listenerApi.dispatch(setLastCommand({ type: 'progress-set', overallProgress: p, ts: Date.now() }));
  }
});
