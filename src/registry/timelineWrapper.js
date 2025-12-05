// src/registry/timelineWrapper.js
// generic wrapper: adapt your Theatre timeline object to a small API
export function wrapTheatreTimeline(theatreTimeline, opts = {}) {
  const duration = opts.durationSeconds ?? theatreTimeline.duration ?? null;
  return {
    play: () => theatreTimeline.play?.(),
    pause: () => theatreTimeline.pause?.(),
    seek: (tSec) => {
      if (typeof theatreTimeline.setTime === 'function') return theatreTimeline.setTime(tSec);
      if (typeof theatreTimeline.seek === 'function') return theatreTimeline.seek(tSec);
      if (typeof theatreTimeline.setCurrentTime === 'function') return theatreTimeline.setCurrentTime(tSec);
      return null;
    },
    seekNormalized: (norm) => {
      const n = Math.max(0, Math.min(1, norm));
      if (duration) return (typeof theatreTimeline.setTime === 'function') ? theatreTimeline.setTime(n * duration) : (theatreTimeline.seek?.(n * duration));
      if (typeof theatreTimeline.setNormalizedTime === 'function') return theatreTimeline.setNormalizedTime(n);
      return theatreTimeline.seek?.(n);
    },
    durationSeconds: duration,
  };
}

export function wrapGsapTimeline(gsapTl) {
  return {
    play: () => gsapTl.play?.(),
    pause: () => gsapTl.pause?.(),
    seek: (tSec) => gsapTl.seek?.(tSec),
    seekNormalized: (n) => {
      const dur = gsapTl.duration?.() ?? 1;
      return gsapTl.seek?.(n * dur);
    },
    durationSeconds: gsapTl.duration?.() ?? null,
  };
}
