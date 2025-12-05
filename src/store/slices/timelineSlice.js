// src/store/slices/timelineSlice.js
import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  phase: 'theatreA', // 'theatreA' | 'helix' | 'theatreB'
  durations: { theatreA: 5 * 60, helix: 20 * 60, theatreB: 30 * 60 }, // seconds
  overallProgress: 0,
  isSeeking: false,
};

const timelineSlice = createSlice({
  name: 'timeline',
  initialState,
  reducers: {
    setPhase: (s, a) => { s.phase = a.payload; },
    setDurations: (s, a) => { s.durations = { ...s.durations, ...a.payload }; },
    setOverallProgress: (s, a) => { s.overallProgress = Math.max(0, Math.min(1, a.payload)); },
    setSeeking: (s, a) => { s.isSeeking = !!a.payload; },
  }
});

export const { setPhase, setDurations, setOverallProgress, setSeeking } = timelineSlice.actions;
export default timelineSlice.reducer;
