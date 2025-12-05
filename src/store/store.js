// src/store/store.js
import { configureStore } from '@reduxjs/toolkit';
import cameraReducer from './slices/cameraSlice';
import timelineReducer from './slices/timelineSlice';
import { listenerMiddleware } from './listeners';

export const store = configureStore({
  reducer: {
    camera: cameraReducer,
    timeline: timelineReducer,
  },
  middleware: (g) => g().prepend(listenerMiddleware.middleware),
  devTools: true,
});

// expose for easy debugging in console
if (typeof window !== 'undefined') window.__REDUX_STORE__ = store;

export default store;
