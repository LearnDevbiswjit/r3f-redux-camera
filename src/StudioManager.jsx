// src/StudioManager.jsx
import React, { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import studio from '@theatre/studio';
import extension from '@theatre/r3f/dist/extension';
import { getProject } from '@theatre/core';

// optional: exported fallback state (for production / final build)
// create a file src/theatreState.json with your exported theatre JSON and uncomment import below
let fallbackState = null;
try {
  // fallbackState = require('./theatreState.json');
} catch (e) {
  fallbackState = null;
}

/*
  StudioManager responsibilities:
  - prefer browser-saved state (localStorage.theatreBrowserState) if present
  - when camera.mode === 'theatre' AND STUDIO_ENABLE_ON_THEATRE true => initialize Studio (studio.initialize/extend) and bind live project/sheet
  - otherwise (Studio off or not theatre mode) load project via saved browser state if exists, else use fallbackState (theatreState.json) else bare getProject()
  - expose small helper to save current project state to localStorage (so you can persist recorded timeline)
*/

// Toggle: if you want Studio to auto-initialize when entering theatre mode.
// If you turn this false (e.g. production), Studio will never initialize and fallback states will be used.
const STUDIO_ENABLE_ON_THEATRE = true;

// localStorage key used to persist project state in browser (developer convenience)
const BROWSER_STATE_KEY = 'theatreBrowserState';

export default function StudioManager({ projectName = 'myProject', sheetName = 'Scene' }) {
  const mode = useSelector(s => s.camera.mode); // 'theatre' | 'helix' etc.
  const initedRef = useRef({ studio: false, extended: false, project: null, sheet: null, usingLiveStudio: false });

  // helper: try to parse localStorage value
  function loadBrowserState() {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(BROWSER_STATE_KEY) : null;
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[StudioManager] failed to parse local browser state', e);
      return null;
    }
  }

  // helper: save given state object (ideally theatre project state) to localStorage
  async function saveToBrowser(stateObj) {
    try {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(BROWSER_STATE_KEY, JSON.stringify(stateObj));
      console.info('[StudioManager] saved theatre state to localStorage');
    } catch (e) {
      console.warn('[StudioManager] saveToBrowser failed', e);
    }
  }

  // expose save helper so you can call from console: window.__saveTheatreBrowserState()
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__saveTheatreBrowserState = async function () {
        try {
          const proj = initedRef.current.project || null;
          if (!proj) {
            console.warn('[StudioManager] no project to export');
            return;
          }
          // try to get project state from theatre core
          try {
            const st = proj.state ? proj.state : null;
            if (st) {
              saveToBrowser(st);
              console.info('[StudioManager] saved project.state to localStorage (approx)');
            } else {
              // fallback: attempt to export via project.toJSON if available
              if (typeof proj.toJSON === 'function') {
                const j = proj.toJSON();
                saveToBrowser(j);
                console.info('[StudioManager] saved project.toJSON to localStorage');
              } else {
                console.warn('[StudioManager] project has no state/toJSON available for saving');
              }
            }
          } catch (err) {
            console.warn('[StudioManager] export attempt failed', err);
          }
        } catch (err) {
          console.error('[StudioManager] __saveTheatreBrowserState error', err);
        }
      };
    }
    return () => {
      if (typeof window !== 'undefined') delete window.__saveTheatreBrowserState;
    };
  }, []);

  useEffect(() => {
    async function initLiveStudio() {
      try {
        if (!initedRef.current.studio) {
          studio.initialize();
          initedRef.current.studio = true;
        }
        if (!initedRef.current.extended) {
          studio.extend(extension);
          initedRef.current.extended = true;
        }
      } catch (e) {
        console.warn('[StudioManager] studio init/extend error', e);
      }

      try {
        // create a live project (no initial state) so Studio editor controls runtime
        const project = getProject(projectName);
        const sheet = project.sheet(sheetName);
        window.__THEATRE_PROJECT__ = project;
        window.__THEATRE_SHEET__ = sheet;
        initedRef.current.project = project;
        initedRef.current.sheet = sheet;
        initedRef.current.usingLiveStudio = true;
        console.info('[StudioManager] Studio live project bound');
      } catch (e) {
        console.warn('[StudioManager] getProject failed during studio init', e);
      }
    }

    async function loadFromBrowserOrFallback() {
      try {
        // prefer browser-saved state
        const browserState = loadBrowserState();
        if (browserState) {
          try {
            const project = getProject(projectName, { state: browserState });
            const sheet = project.sheet(sheetName);
            window.__THEATRE_PROJECT__ = project;
            window.__THEATRE_SHEET__ = sheet;
            initedRef.current.project = project;
            initedRef.current.sheet = sheet;
            initedRef.current.usingLiveStudio = false;
            console.info('[StudioManager] loaded project from browser-saved state');
            return;
          } catch (err) {
            console.warn('[StudioManager] failed to load browser-saved state (falling back)', err);
          }
        }

        // no browser state — try fallback JSON if present
        if (fallbackState) {
          try {
            const project = getProject(projectName, { state: fallbackState });
            const sheet = project.sheet(sheetName);
            window.__THEATRE_PROJECT__ = project;
            window.__THEATRE_SHEET__ = sheet;
            initedRef.current.project = project;
            initedRef.current.sheet = sheet;
            initedRef.current.usingLiveStudio = false;
            console.info('[StudioManager] loaded project from fallback theatreState.json');
            return;
          } catch (err) {
            console.warn('[StudioManager] failed to load fallback theatreState.json', err);
          }
        }

        // last resort: just getProject() bare (empty)
        try {
          const project = getProject(projectName);
          const sheet = project.sheet(sheetName);
          window.__THEATRE_PROJECT__ = project;
          window.__THEATRE_SHEET__ = sheet;
          initedRef.current.project = project;
          initedRef.current.sheet = sheet;
          initedRef.current.usingLiveStudio = false;
          console.info('[StudioManager] initialized bare project (no state)');
        } catch (err) {
          console.warn('[StudioManager] getProject bare failed', err);
        }
      } catch (err) {
        console.error('[StudioManager] loadFromBrowserOrFallback error', err);
      }
    }

    // DECISION LOGIC:
    // Priority: if STUDIO_ENABLE_ON_THEATRE && mode==='theatre' -> init live Studio
    // else prefer browser-saved state; if not found, use fallbackState (theatreState.json); else bare getProject()
    if (mode === 'theatre' && STUDIO_ENABLE_ON_THEATRE) {
      initLiveStudio();
      // mark guard so wrappers avoid overriding camera transforms while Studio editing
      window.__THEATRE_CONTROL_ACTIVE = true;
    } else {
      window.__THEATRE_CONTROL_ACTIVE = false;
      // load project from browser-saved or fallback JSON
      loadFromBrowserOrFallback();
    }

    // note: we intentionally do NOT attempt to fully "dispose" studio UI when toggling off.
    // studio package currently lacks a robust public dispose/unmount API. We switch project binding instead.
  }, [mode, projectName, sheetName]);

  return null;
}
