import React, { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setOverallProgress } from '../store/slices/timelineSlice';

/*
  Changes:
  - Add scroll smoothing/inertia: we track targetNorm (from window.scrollY) and currentNorm
    and lerp currentNorm -> targetNorm on an animation frame loop using smoothing factor.
  - Dispatch setOverallProgress using the smoothed currentNorm so camera receives smoothed progress.
  - window.__scrollJumpTo(norm) remains but uses smooth scrolling and updates target immediately.
*/

export default function ScrollMapper({ pxPerSec = 5, smoothing = 0.12 }) {
  const dispatch = useDispatch();
  const durations = useSelector(s => s.timeline.durations);
  const ticking = useRef(false);

  // smoothing = 0..1 where smaller = smoother/slower. We internally convert to lerp alpha.
  const targetNorm = useRef(0);
  const currentNorm = useRef(0);
  const rafRef = useRef(null);
  const spacerRef = useRef(null);

  useEffect(() => {
    const totalSeconds = (durations.theatreA || 0) + (durations.helix || 0) + (durations.theatreB || 0);
    const totalHeight = Math.max(window.innerHeight, Math.floor(totalSeconds * pxPerSec));
    const el = document.getElementById('scroll-spacer');
    if (el) el.style.height = `${totalHeight}px`;
    spacerRef.current = el;
  }, [durations, pxPerSec]);

  // read immediate scroll target into targetNorm
  useEffect(() => {
    function sampleTargetFromWindow() {
      const y = window.scrollY || window.pageYOffset || 0;
      const spacer = document.getElementById('scroll-spacer');
      if (!spacer) return 0;
      const max = Math.max(1, spacer.offsetHeight - window.innerHeight);
      const norm = Math.max(0, Math.min(1, y / max));
      return norm;
    }

    function onScroll() {
      // update target immediately (do not dispatch directly)
      targetNorm.current = sampleTargetFromWindow();
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    // initial sample
    targetNorm.current = sampleTargetFromWindow();

    // provide global helper for imperative scroll jumps (keeps target in sync).
    window.__scrollJumpTo = (norm) => {
      const spacer = document.getElementById('scroll-spacer');
      const clamped = Math.max(0, Math.min(1, norm || 0));
      if (!spacer) return;
      const max = Math.max(1, spacer.offsetHeight - window.innerHeight);
      const targetY = Math.round(clamped * max);
      // use smooth behavior where possible
      try {
        window.scrollTo({ top: targetY, behavior: 'smooth' });
      } catch (e) {
        window.scrollTo(0, targetY);
      }
      // also set targetNorm so our smoothing loop heads there
      targetNorm.current = clamped;
    };

    return () => {
      window.removeEventListener('scroll', onScroll);
      // don't cancel __scrollJumpTo - but you can remove if desired
    };
  }, []);

  // smoothing loop: lerp currentNorm -> targetNorm and dispatch updates
  useEffect(() => {
    let last = performance.now();
    function step(now) {
      const dt = Math.min(0.05, (now - last) / 1000); // clamp dt
      last = now;

      // convert smoothing param to an alpha per-frame (simple expo)
      // smoothing param near 0 => very smooth (slow); near 1 => immediate
      const alpha = 1 - Math.exp(-Math.max(0.0001, smoothing) * 60 * dt);

      // lerp
      currentNorm.current += (targetNorm.current - currentNorm.current) * alpha;

      // dispatch small changes only when meaningful to avoid redux spam
      dispatch(setOverallProgress(Math.max(0, Math.min(1, currentNorm.current))));

      rafRef.current = requestAnimationFrame(step);
    }

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [dispatch, smoothing]);

  return <div id="scroll-spacer" style={{ width: '1px', height: '100vh' }} />;
}
