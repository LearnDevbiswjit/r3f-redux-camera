// src/theatre/initStudio.js
// Browser-safe initialization + extension example.
// Call this from TimelineBootstrap useEffect (only on client).

import { getProject } from '@theatre/core';
import studio from '@theatre/studio';
// Optional: import any extension your project needs (replace with actual)
 // import extension from '@theatre/r3f'; // example, if you use theatre r3f helpers
 // import stateExtension from '@theatre/state'; // example

export function initTheatreStudio({ projectName = 'myProject', sheetName = 'Scene', stateJson = null } = {}) {
  if (typeof window === 'undefined') return null; // SSR safe

  // 1) Initialize studio UI (only in dev or when you want UI open)
  try {
    studio.initialize(); // opens studio UI panel (default)
    // If you have an extension, extend it:
    // studio.extend(extension);
    // studio.extend(stateExtension);
  } catch (e) {
    // studio.initialize may throw in some builds — swallow in prod
    console.warn('Theatre Studio init failed or already initialized', e);
  }

  // 2) Create / get Project with optional saved state
  const project = stateJson
    ? getProject(projectName, { state: stateJson })
    : getProject(projectName);

  // expose for debugging
  window.__THEATRE_PROJECT__ = project;

  // 3) get sheet
  let sheet = null;
  try {
    sheet = project.sheet(sheetName);
  } catch (e) {
    console.warn('Could not get sheet', sheetName, e);
  }

  // return useful handles
  return { studio, project, sheet };
}
