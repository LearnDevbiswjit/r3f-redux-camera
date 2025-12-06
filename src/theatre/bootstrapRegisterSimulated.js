// src/theatre/bootstrapRegisterSimulated.js
// Simulated theatre wrappers for quick testing (will be used only if no real sheet is registered)
import * as THREE from 'three';

/**
 * registerSimulatedTheatre(registry, remoteState = null, opts = {})
 *
 * - registry: TimelineRegistry (from TimelineRegistryContext)
 * - remoteState: optional object (e.g. loaded /theatreState.json or merged runtime state)
 *     if remoteState.theatreBStartCamera exists (shape: { pos:{x,y,z}, quat:{x,y,z,w} })
 *     we will insert that pose as the first keyframe for theatreB and hold it for holdSeconds.
 * - opts: { holdSeconds: number, theatreADuration: number, theatreBDuration: number }
 *
 * This is best-effort & defensive: it will not throw if values are missing.
 */

// --- helpers (copied / adapted from your previous file) ---
function lerpVec3(a, b, t) {
  return new THREE.Vector3(
    a.x + (b.x - a.x) * t,
    a.y + (b.y - a.y) * t,
    a.z + (b.z - a.z) * t
  );
}

function slerpQuatInstance(a, b, t) {
  const out = a.clone();
  out.slerp(b, t);
  return out;
}

function sampleKeyframes(keyframes, norm) {
  const n = Math.max(0, Math.min(1, norm));
  const seg = (keyframes.length - 1) * n;
  const i = Math.floor(seg);
  const t = seg - i;
  const a = keyframes[Math.min(i, keyframes.length - 1)];
  const b = keyframes[Math.min(i + 1, keyframes.length - 1)];
  const p = lerpVec3(a.p, b.p, t);
  const q = slerpQuatInstance(a.q, b.q, t);
  return { p, q };
}

// --- default sample keyframes (fallback if none provided) ---
const keyA = [
  { p: new THREE.Vector3(0, 6, 18), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)) },
  { p: new THREE.Vector3(0, 4, 10), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.1, 0.2, 0)) },
  { p: new THREE.Vector3(0, 3, 6),  q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0.5, 0)) },
];

const keyB_default = [
  { p: new THREE.Vector3(2, 8, 20), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.05, -0.2, 0)) },
  { p: new THREE.Vector3(0, 5, 12), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.08, 0.1, 0)) },
  { p: new THREE.Vector3(-1, 3.5, 7), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0.4, 0)) },
];

// Build a wrapper timeline object for registry
function makeWrapper(keyframes, durationSeconds = 20 * 60) {
  return {
    play() {},
    pause() {},
    seek(tSec) {
      const norm = durationSeconds ? (tSec / durationSeconds) : 0;
      return this.seekNormalized?.(norm);
    },
    seekNormalized(n) {
      if (typeof window !== 'undefined' && window.__THEATRE_CONTROL_ACTIVE) {
        // allow Studio to control camera while recording / editing
        return;
      }
      const camRef = registry.getCameraRef?.();
      if (!camRef || !camRef.camera) return;
      const { p, q } = sampleKeyframes(keyframes, n);
      if (camRef.smoothJumpToTransform) {
        camRef.smoothJumpToTransform({ pos: p, quat: q }, 0.3);
      } else {
        camRef.camera.position.copy(p);
        camRef.camera.quaternion.copy(q);
        camRef.camera.updateMatrixWorld();
      }
    },
    durationSeconds
  };
}

/**
 * Build theatreB keyframes by optionally prepending a "hold" pose captured from helix end.
 * - startPose: { pos: {x,y,z}, quat: {x,y,z,w} } or null
 * - baseKeyframes: default keyframes if no remote keyframes present
 * - holdSeconds: how long to hold the startPose at timeline start (seconds)
 * - totalDuration: total theatreB duration in seconds
 *
 * Strategy:
 *   If startPose provided:
 *     - create first keyframe at t=0 with startPose
 *     - create second keyframe at t = holdSeconds/totalDuration that transitions toward baseKeyframes[0]
 *     - append the baseKeyframes (but trim/proportionally shift their effective sampling to start from hold offset)
 */
function buildTheatreBKeyframes({ startPose = null, baseKeyframes = keyB_default, holdSeconds = 2, totalDuration = 30 * 60 }) {
  // convert startPose into internal keyframe shape { p:Vector3, q:Quaternion }
  let base = (baseKeyframes && baseKeyframes.length) ? baseKeyframes.slice() : keyB_default.slice();

  if (!startPose) {
    return base;
  }

  // defensive parse of startPose
  try {
    const sp = {
      p: new THREE.Vector3(Number(startPose.pos.x), Number(startPose.pos.y), Number(startPose.pos.z)),
      q: new THREE.Quaternion(Number(startPose.quat.x), Number(startPose.quat.y), Number(startPose.quat.z), Number(startPose.quat.w))
    };

    // If base starts very close to sp, we can just keep base but ensure hold at zero by placing identical first key.
    // Otherwise create a short transition key.
    const holdNorm = Math.max(0, Math.min(1, (holdSeconds / Math.max(0.0001, totalDuration))));
    const out = [];

    // push explicit hold key at start
    out.push({ p: sp.p.clone(), q: sp.q.clone() });

    // create transition key that moves towards base[0] at time = holdNorm
    const firstBase = base[0];
    const firstBaseP = firstBase.p.clone ? firstBase.p.clone() : (firstBase.p instanceof THREE.Vector3 ? firstBase.p.clone() : new THREE.Vector3(firstBase.p.x, firstBase.p.y, firstBase.p.z));
    const firstBaseQ = firstBase.q.clone ? firstBase.q.clone() : (firstBase.q instanceof THREE.Quaternion ? firstBase.q.clone() : new THREE.Quaternion(firstBase.q.x, firstBase.q.y, firstBase.q.z, firstBase.q.w));

    // If holdNorm is zero (holdSeconds << totalDuration) we still add a near-instant transition
    const tTo = Math.max(0.00001, holdNorm);
    // Create intermediate key by lerping halfway (this gives a smoothing entry)
    const midP = lerpVec3(sp.p, firstBaseP, 0.5);
    const midQ = slerpQuatInstance(sp.q, firstBaseQ, 0.5);

    // second key: mid (roughly at holdNorm)
    out.push({ p: midP, q: midQ });

    // Append the remainder base keyframes (they will be sampled over the remainder of the timeline)
    // We don't attempt to re-time them here; sampleKeyframes will interpret them as uniform steps.
    for (let k of base) out.push({ p: k.p.clone(), q: k.q.clone() });

    return out;
  } catch (e) {
    // fallback: if anything bad, return base
    console.warn('[bootstrapRegisterSimulated] buildTheatreBKeyframes failed, using base', e);
    return base;
  }
}

/**
 * Main export: registerSimulatedTheatre
 */
export function registerSimulatedTheatre(registry, remoteState = null, opts = {}) {
  // options
  const holdSeconds = typeof opts.holdSeconds === 'number' ? opts.holdSeconds : 2;
  const theatreADuration = typeof opts.theatreADuration === 'number' ? opts.theatreADuration : 20 * 60;
  const theatreBDuration = typeof opts.theatreBDuration === 'number' ? opts.theatreBDuration : 30 * 60;

  // detect exported helix-end pose
  let startPose = null;
  if (remoteState && remoteState.theatreBStartCamera) {
    startPose = remoteState.theatreBStartCamera;
  } else if (typeof window !== 'undefined' && window.__THEATRE_B_START_CAMERA__) {
    startPose = window.__THEATRE_B_START_CAMERA__;
  }

  // Build theatreB keyframes (with optional start hold)
  const keyB = buildTheatreBKeyframes({ startPose, baseKeyframes: keyB_default, holdSeconds, totalDuration: theatreBDuration });

  // Keyframes for theatreA remain default (or you could also merge remoteState.theatreA if present)
  const keyA_used = keyA.slice();

  // Build wrappers which will sample these keyframes
  function makeWrapperLocal(keyframes, durationSeconds = 20 * 60) {
    return {
      play() {},
      pause() {},
      seek(tSec) {
        const norm = durationSeconds ? (tSec / durationSeconds) : 0;
        return this.seekNormalized?.(norm);
      },
      seekNormalized(n) {
        if (typeof window !== 'undefined' && window.__THEATRE_CONTROL_ACTIVE) {
          // allow Studio to control camera while recording
          return;
        }
        const camRef = registry.getCameraRef?.();
        if (!camRef || !camRef.camera) return;
        const { p, q } = sampleKeyframes(keyframes, n);
        if (camRef.smoothJumpToTransform) {
          camRef.smoothJumpToTransform({ pos: p, quat: q }, 0.3);
        } else {
          camRef.camera.position.copy(p);
          camRef.camera.quaternion.copy(q);
          camRef.camera.updateMatrixWorld();
        }
      },
      durationSeconds
    };
  }

  // Register into registry
  registry.registerTimeline('theatreA', makeWrapperLocal(keyA_used, theatreADuration));
  registry.registerTimeline('theatreB', makeWrapperLocal(keyB, theatreBDuration));
}
