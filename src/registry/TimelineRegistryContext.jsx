// src/registry/TimelineRegistryContext.jsx
import React, { createContext, useContext, useRef } from 'react';

class TimelineRegistry {
  constructor() {
    this.timelines = new Map();
    this.cameraRef = null;
  }
  registerTimeline(id, wrapper) { this.timelines.set(id, wrapper); }
  getTimeline(id) { return this.timelines.get(id); }
  playTimeline(id) { this.timelines.get(id)?.play?.(); }
  pauseTimeline(id) { this.timelines.get(id)?.pause?.(); }
  seekTimeline(id, tSec) { this.timelines.get(id)?.seek?.(tSec); }
  seekTimelineNormalized(id, norm) {
    const w = this.timelines.get(id);
    if (!w) return;
    if (typeof w.seekNormalized === 'function') return w.seekNormalized(norm);
    if (w.durationSeconds) {
      const tSec = Math.max(0, Math.min(1, norm)) * w.durationSeconds;
      return w.seek?.(tSec);
    }
    return w.seek?.(norm);
  }
  setCameraRef(ref) { this.cameraRef = ref; }
  getCameraRef() { return this.cameraRef; }
}

const RegistryContext = createContext(null);

export function RegistryProvider({ children }) {
  const ref = useRef(new TimelineRegistry());
  if (typeof window !== 'undefined') window.__TimelineRegistry__ = ref.current;
  return <RegistryContext.Provider value={ref.current}>{children}</RegistryContext.Provider>;
}

export function useRegistry() {
  const ctx = useContext(RegistryContext);
  if (!ctx) throw new Error('useRegistry must be used within RegistryProvider');
  return ctx;
}
