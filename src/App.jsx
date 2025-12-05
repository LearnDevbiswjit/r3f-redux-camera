// src/App.jsx
import React, { useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { Canvas } from '@react-three/fiber';
import { SheetProvider } from '@theatre/r3f';
import { getProject } from '@theatre/core';
import { Leva } from 'leva';
// If you need explicit Leva CSS (only if your global CSS hides it), uncomment:
// import 'leva/dist/index.css';

import { store } from './store/store';
import { RegistryProvider, useRegistry } from './registry/TimelineRegistryContext';
import CameraRig from './components/CameraRig';
import CameraSwitcher from './components/CameraSwitcher';
import ScrollMapper from './components/ScrollMapper';
import DebugScrubber from './components/DebugScrubber';
import WaterScene from './component/WaterScene';

import StudioManager from './StudioManager';
import { registerSimulatedTheatre } from './theatre/bootstrapRegisterSimulated';
import { registerSheetTimelines } from './theatre/autoRegisterSheet';

// ------------------ ENSURE A BARE THEATRE SHEET EXISTS EARLY ------------------
// Create a minimal project + sheet at module-run time so SheetProvider can always mount
// and @theatre/r3f hooks won't throw "No sheet found".
let initialProject = null;
let initialSheet = null;
if (typeof window !== 'undefined') {
  try {
    initialProject = getProject('myProject'); // bare project (no state)
    initialSheet = initialProject.sheet('Scene');
    // expose to global so other modules can read immediately
    window.__THEATRE_PROJECT__ = window.__THEATRE_PROJECT__ || initialProject;
    window.__THEATRE_SHEET__ = window.__THEATRE_SHEET__ || initialSheet;
    console.info('[App] initial Theatre project+sheet ensured');
  } catch (e) {
    console.warn('[App] could not create initial Theatre project/sheet:', e?.message || e);
  }
}

// ---------------- BIND SHEET DYNAMICALLY (reads window.__THEATRE_SHEET__ updates) ----------------
function SheetBinder({ children }) {
  const [sheet, setSheet] = useState(() => {
    return typeof window !== 'undefined' ? window.__THEATRE_SHEET__ || null : null;
  });

  useEffect(() => {
    let mounted = true;
    function sync() {
      if (!mounted) return;
      if (typeof window !== 'undefined' && window.__THEATRE_SHEET__ && window.__THEATRE_SHEET__ !== sheet) {
        setSheet(window.__THEATRE_SHEET__);
      }
    }
    const id = setInterval(sync, 200);
    sync();
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [sheet]);

  const providerSheet = sheet || (typeof window !== 'undefined' ? window.__THEATRE_SHEET__ || initialSheet : initialSheet);

  if (!providerSheet) return children;

  return <SheetProvider sheet={providerSheet}>{children}</SheetProvider>;
}

// ---------------- TIMELINE BOOTSTRAP ----------------
function TimelineBootstrap() {
  const registry = useRegistry();

  useEffect(() => {
    function tryRegister() {
      const sheet = typeof window !== 'undefined' ? window.__THEATRE_SHEET__ : null;
      // obtain durations from redux store snapshot
      const st = store.getState();
      const durations = (st && st.timeline && st.timeline.durations)
        ? st.timeline.durations
        : { theatreA: 20 * 60, helix: 20 * 60, theatreB: 30 * 60 };

      if (sheet) {
        registerSheetTimelines(registry, sheet, durations);
      } else {
        registerSimulatedTheatre(registry);
      }
    }

    tryRegister();
    const id = setInterval(tryRegister, 400);
    return () => clearInterval(id);
  }, [registry]);

  return null;
}

// ---------------- MAIN APP ----------------
export default function App() {
  return (
    <Provider store={store}>
      <RegistryProvider>
        {/* Leva root must be OUTSIDE the r3f Canvas to avoid react-three-fiber trying to treat DOM nodes as three objects */}
        <Leva collapsed={false} />

        <StudioManager />
        <TimelineBootstrap />
        <ScrollMapper pxPerSec={5} />

        <Canvas style={{ position: 'fixed', inset: 0 }}>
          <SheetBinder>
            <CameraSwitcher theatreKey="Camera" />
            <CameraRig />
            <WaterScene />
          </SheetBinder>
        </Canvas>

        <DebugScrubber />
      </RegistryProvider>
    </Provider>
  );
}
