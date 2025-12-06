// src/App.jsx
import React, { useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { Canvas } from '@react-three/fiber';
import { SheetProvider } from '@theatre/r3f';
import { getProject } from '@theatre/core';
import { Leva } from 'leva';
 

import theatreStateBundled from './assets/theatreState.json'; // <-- ensure this exists
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

import * as THREE from 'three';

// ------------------ ENSURE THEATRE PROJECT + SHEET (state injected if available) ------------------
let initialProject = null;
let initialSheet = null;
if (typeof window !== 'undefined') {
  try {
    const stateToLoad = window.__THEATRE_REMOTE_STATE__ || theatreStateBundled || null;
    if (stateToLoad) {
      initialProject = getProject('myProject', { state: stateToLoad });
    } else {
      initialProject = getProject('myProject');
    }
    initialSheet = initialProject.sheet('Scene');
    window.__THEATRE_PROJECT__ = window.__THEATRE_PROJECT__ || initialProject;
    window.__THEATRE_SHEET__ = window.__THEATRE_SHEET__ || initialSheet;
    console.info('[App] initial Theatre project+sheet ensured (state injected?)');
  } catch (e) {
    console.warn('[App] could not create initial Theatre project/sheet:', e?.message || e);
  }
}

// ---------------- BIND SHEET DYNAMICALLY ----------------
function SheetBinder({ children }) {
  const [sheet, setSheet] = useState(() => (typeof window !== 'undefined' ? window.__THEATRE_SHEET__ || null : null));

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

// ---------------- extractor helper ----------------
function extractCameraFromState(state) {
  if (!state || typeof state !== 'object') return null;
  if (state.camera && state.camera.position && state.camera.quaternion) return { pos: state.camera.position, quat: state.camera.quaternion };
  if (state.timeline && state.timeline.camera && state.timeline.camera.position && state.timeline.camera.quaternion) return { pos: state.timeline.camera.position, quat: state.timeline.camera.quaternion };

  try {
    const sb = state.sheetsById;
    if (sb && typeof sb === 'object') {
      for (const sid in sb) {
        if (!Object.prototype.hasOwnProperty.call(sb, sid)) continue;
        const sheet = sb[sid];
        if (!sheet) continue;
        const so = sheet.staticOverrides || sheet.static || sheet.staticValues || null;
        if (so && so.byObject && so.byObject.Camera) {
          const camObj = so.byObject.Camera;
          if (camObj.transform && camObj.transform.position && camObj.transform.quaternion) {
            return { pos: camObj.transform.position, quat: camObj.transform.quaternion };
          }
          if (camObj.position && camObj.quaternion) {
            return { pos: camObj.position, quat: camObj.quaternion };
          }
          if (camObj.transform && camObj.transform.position && camObj.transform.target) {
            try {
              const p = new THREE.Vector3(camObj.transform.position.x, camObj.transform.position.y, camObj.transform.position.z);
              const t = new THREE.Vector3(camObj.transform.target.x, camObj.transform.target.y, camObj.transform.target.z);
              const m = new THREE.Matrix4(); m.lookAt(p, t, new THREE.Vector3(0,1,0));
              const q = new THREE.Quaternion().setFromRotationMatrix(m);
              return { pos: camObj.transform.position, quat: { x: q.x, y: q.y, z: q.z, w: q.w } };
            } catch (e) { /* ignore */ }
          }
        }
      }
    }
  } catch (e) {
    console.warn('[extractCameraFromState] parse error', e?.message || e);
  }

  try {
    const walker = (o) => {
      if (!o || typeof o !== 'object') return null;
      if (o.position && o.quaternion) return { pos: o.position, quat: o.quaternion };
      for (const k in o) {
        if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
        const r = walker(o[k]);
        if (r) return r;
      }
      return null;
    };
    return walker(state);
  } catch (e) { /* ignore */ }

  return null;
}

// ---------------- TIMELINE BOOTSTRAP ----------------
function TimelineBootstrap() {
  const registry = useRegistry();

  useEffect(() => {
    let cancelled = false;

    async function tryRegister() {
      if (cancelled) return;
      const sheet = typeof window !== 'undefined' ? window.__THEATRE_SHEET__ : null;

      // try fetching public/theatreState.json (deployed)
      let remoteState = null;
      try {
        const res = await fetch('/theatreState.json', { cache: 'no-cache' });
        if (res.ok) {
          remoteState = await res.json();
          console.info('[TimelineBootstrap] fetched /theatreState.json');
        } else {
          console.info('[TimelineBootstrap] /theatreState.json not served (status)', res.status);
        }
      } catch (err) {
        // ignore
      }

      // fallback to global/bundled
      if (!remoteState) {
        remoteState = window.__THEATRE_REMOTE_STATE__ || theatreStateBundled || null;
      }

      if (remoteState) {
        const cam = extractCameraFromState(remoteState);
        if (cam) {
          window.__THEATRE_REMOTE_STATE__ = remoteState;
          window.__THEATRE_STATIC_CAMERA__ = cam;
          window.__THEATRE_B_START_CAMERA__ = window.__THEATRE_B_START_CAMERA__ || cam;
          if (remoteState.durations) window.__THEATRE_REMOTE_DURATIONS__ = remoteState.durations;
          if (remoteState.timeline && remoteState.timeline.durations) window.__THEATRE_REMOTE_DURATIONS__ = remoteState.timeline.durations;
        } else {
          window.__THEATRE_REMOTE_STATE__ = remoteState;
        }
      }

      const st = store.getState();
      const durationsFromStore = (st && st.timeline && st.timeline.durations) ? st.timeline.durations : null;
      const finalDur = durationsFromStore || (remoteState && (remoteState.durations || (remoteState.timeline && remoteState.timeline.durations))) || { theatreA: 20*60, helix: 20*60, theatreB: 30*60 };

      if (sheet) {
        registerSheetTimelines(registry, sheet, finalDur);
      } else if (remoteState) {
        registerSimulatedTheatre(registry, remoteState);
      } else {
        registerSimulatedTheatre(registry, { durations: finalDur });
      }
    }

    tryRegister();
    const id = setInterval(tryRegister, 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [registry]);

  return null;
}

// ---------------- MAIN APP ----------------
export default function App() {
  useEffect(() => {
    const id = 'app-leva-fix';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.innerHTML = `
      .leva-ui { position: fixed !important; top: 12px !important; left: 12px !important; z-index: 999999 !important; pointer-events: auto !important; }
      canvas { z-index: 0 !important; }
      body, #root { overflow: visible !important; }
    `;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (process.env.NODE_ENV === 'production') {
      if (typeof theatreStateBundled !== 'undefined' && theatreStateBundled) {
        window.__THEATRE_REMOTE_STATE__ = theatreStateBundled;
        const cam = extractCameraFromState(theatreStateBundled);
        if (cam) {
          window.__THEATRE_STATIC_CAMERA__ = cam;
          window.__THEATRE_B_START_CAMERA__ = window.__THEATRE_B_START_CAMERA__ || cam;
          if (theatreStateBundled.durations) window.__THEATRE_REMOTE_DURATIONS__ = theatreStateBundled.durations;
          if (theatreStateBundled.timeline && theatreStateBundled.timeline.durations) window.__THEATRE_REMOTE_DURATIONS__ = theatreStateBundled.timeline.durations;
          console.info('[App] applied bundled theatreState fallback (production)');
        } else {
          window.__THEATRE_REMOTE_STATE__ = theatreStateBundled;
        }
      }
    }
  }, []);

  return (
    <Provider store={store}>
      <RegistryProvider>
        <Leva collapsed={false} />
        {process.env.NODE_ENV !== 'production' && <StudioManager />}

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
