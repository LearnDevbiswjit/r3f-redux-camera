// src/store/slices/cameraSlice.js
import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  mode: 'theatre', // 'theatre' | 'helix' — determines which controller acts
  progress: 0,     // 0..1 used in helix
  offset: { x: 0, y: 0, z: 0 },
  damping: 0.002,
  tightFollow: true,
  locked: false,
  lastCommand: null,
};

const cameraSlice = createSlice({
  name: 'camera',
  initialState,
  reducers: {
    setMode: (s, a) => { s.mode = a.payload; },
    setProgress: (s, a) => { s.progress = Math.max(0, Math.min(1, a.payload)); },
    setOffset: (s, a) => { s.offset = { ...s.offset, ...a.payload }; },
    setDamping: (s, a) => { s.damping = a.payload; },
    setTightFollow: (s, a) => { s.tightFollow = !!a.payload; },
    lockCamera: (s) => { s.locked = true; },
    unlockCamera: (s) => { s.locked = false; },
    setLastCommand: (s, a) => { s.lastCommand = a.payload; },
  }
});

export const { setMode, setProgress, setOffset, setDamping, setTightFollow, lockCamera, unlockCamera, setLastCommand } = cameraSlice.actions;
export default cameraSlice.reducer;
