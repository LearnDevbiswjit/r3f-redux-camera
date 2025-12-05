// src/theatre/bootstrapRegister.js
import { initTheatreStudio } from './initStudio';
import { wrapTheatreTimeline } from '../registry/timelineWrapper';

// call from TimelineBootstrap useEffect
export function bootstrapTheatreAndRegister({ registry, stateJson = null }) {
  const { project, sheet } = initTheatreStudio({ projectName: 'myProject', sheetName: 'Scene', stateJson });

  // --- Replace below with how you actually obtain timeline objects from your sheet/project ---
  // Example placeholder: adapt to your project's API.
  let theatreTimelineA = null;
  let theatreTimelineB = null;

  try {
    // common patterns:
    // theatreTimelineA = sheet.sequence('A')
    // or project.getTimeline('A') — adapt to your app
    theatreTimelineA = sheet?.sequence?.('A') || sheet?.object?.('CameraA') || null;
    theatreTimelineB = sheet?.sequence?.('B') || sheet?.object?.('CameraB') || null;
  } catch (e) {
    console.warn('Could not fetch timeline from sheet automatically. Replace with your API.', e);
  }

  if (theatreTimelineA) {
    const wrapperA = wrapTheatreTimeline(theatreTimelineA, { durationSeconds: 20 * 60 });
    registry.registerTimeline('theatreA', wrapperA);
  } else {
    console.warn('theatreTimelineA not found — register manually when you have the runtime object.');
  }

  if (theatreTimelineB) {
    const wrapperB = wrapTheatreTimeline(theatreTimelineB, { durationSeconds: 30 * 60 });
    registry.registerTimeline('theatreB', wrapperB);
  } else {
    console.warn('theatreTimelineB not found — register manually when you have the runtime object.');
  }

  return { project, sheet, theatreTimelineA, theatreTimelineB };
}
