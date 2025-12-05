// src/theatre/bootstrapRegisterSimulated.js
// Simulated theatre wrappers for quick testing (will be used only if no real sheet is registered)
import * as THREE from 'three';

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

const keyA = [
  { p: new THREE.Vector3(0, 6, 18), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)) },
  { p: new THREE.Vector3(0, 4, 10), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.1, 0.2, 0)) },
  { p: new THREE.Vector3(0, 3, 6),  q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0.5, 0)) },
];

const keyB = [
  { p: new THREE.Vector3(2, 8, 20), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.05, -0.2, 0)) },
  { p: new THREE.Vector3(0, 5, 12), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.08, 0.1, 0)) },
  { p: new THREE.Vector3(-1, 3.5, 7), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0.4, 0)) },
];

export function registerSimulatedTheatre(registry) {
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

  registry.registerTimeline('theatreA', makeWrapper(keyA, 20 * 60));
  registry.registerTimeline('theatreB', makeWrapper(keyB, 30 * 60));
}
