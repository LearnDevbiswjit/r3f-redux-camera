// src/components/CameraRig.jsx
import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useSelector } from 'react-redux';
import { useRegistry } from '../registry/TimelineRegistryContext';
import Briks from '../Briks'; // adjust path if necessary

function makeHelixPoints({ turns = 10, height = 80, radius = 18, points = 2000 }) {
  const arr = [];
  for (let i = 0; i <= points; i++) {
    const t = i / points;
    const angle = t * turns * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = height * (1 - t);
    arr.push(new THREE.Vector3(x, y, z));
  }
  return arr;
}

function buildArcLengthLUT(curve, samples = 1000) {
  const u = [];
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const uu = i / samples;
    u.push(uu);
    pts.push(curve.getPoint(uu));
  }
  const s = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += pts[i].distanceTo(pts[i - 1]);
    s.push(total);
  }
  return { uSamples: u, sSamples: s, totalLength: total, pts };
}

function mapArcToU(lut, arcNorm) {
  const sTarget = Math.max(0, Math.min(1, arcNorm)) * lut.totalLength;
  let lo = 0, hi = lut.sSamples.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (lut.sSamples[mid] < sTarget) lo = mid + 1;
    else hi = mid - 1;
  }
  const i = Math.max(1, lo);
  const s0 = lut.sSamples[i - 1];
  const s1 = lut.sSamples[i];
  const u0 = lut.uSamples[i - 1];
  const u1 = lut.uSamples[i];
  const t = s1 === s0 ? 0 : (sTarget - s0) / (s1 - s0);
  const u = u0 + (u1 - u0) * t;
  return Math.max(0, Math.min(1, u));
}

export default function CameraRig({
  initialHelixConfig = { turns: 10, height: 80, radius: 18, points: 2000 },
  lutSamples = 1500,
  holdSecondsForB = 2
}) {
  const { camera } = useThree();
  const registry = useRegistry();

  const camState = useSelector(s => s.camera);
  const timelineOverall = useSelector(s => s.timeline.overallProgress);
  const durations = useSelector(s => s.timeline.durations);

  const controls = useRef({
    turns: initialHelixConfig.turns,
    height: initialHelixConfig.height,
    radius: initialHelixConfig.radius,
    points: initialHelixConfig.points,
    initialYawDeg: 90,
    blendDuration: 0.8,
    showBriks: true,
    pathScale: 5,
    brickSpacing: 10,
    brickScale: 1,
    brickPathColor: '#ff3b30',
    camOffsetX: 0,
    camOffsetY: 0,
    camOffsetZ: 0,
    camRotDegX: 0,
    camRotDegY: 0,
    camRotDegZ: 0,
    tightFollow: true,
    damping: 6
  }).current;

  const curveRef = useRef(null);
  const lutRef = useRef(null);
  const ptsRef = useRef([]);
  const desired = useRef(new THREE.Vector3());
  const tmp = useRef(new THREE.Vector3());

  const prevMode = useRef(camState.mode);
  const blendT = useRef(1);
  const blendDurationRef = useRef(0.8);
  const initialYawOffsetRad = useRef(THREE.MathUtils.degToRad(90));

  const bHoldActive = useRef(false);
  const bHoldTimer = useRef(0);
  const bAppliedOnce = useRef(false);
  const lastEndPose = useRef({ pos: new THREE.Vector3(), quat: new THREE.Quaternion() });

  function syncControlsFromGlobals() {
    if (typeof window === 'undefined') return;
    const g = window.__LEVA_CAMERA_STATE__ || window.__THEATRE_REMOTE_STATE__ || {};
    const keys = Object.keys(controls);
    for (const k of keys) {
      if (g[k] !== undefined) controls[k] = g[k];
    }
    blendDurationRef.current = Math.max(0.0001, Number(controls.blendDuration) || 0.8);
    initialYawOffsetRad.current = THREE.MathUtils.degToRad(Number(controls.initialYawDeg) || 0);
  }

  function rebuildHelix() {
    const cfg = {
      turns: Number(controls.turns) || initialHelixConfig.turns,
      height: Number(controls.height) || initialHelixConfig.height,
      radius: Number(controls.radius) || initialHelixConfig.radius,
      points: Number(controls.points) || initialHelixConfig.points
    };
    const pts = makeHelixPoints(cfg);
    ptsRef.current = pts;
    curveRef.current = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    lutRef.current = buildArcLengthLUT(curveRef.current, Math.max(300, lutSamples));
  }

  function getCameraWorldPoseObj() {
    const p = camera.position.clone();
    const q = camera.quaternion.clone();
    return { pos: { x: p.x, y: p.y, z: p.z }, quat: { x: q.x, y: q.y, z: q.z, w: q.w } };
  }

  function applyPoseToCamera(poseObj) {
    try {
      if (!poseObj || !poseObj.pos || !poseObj.quat) return false;
      camera.position.set(Number(poseObj.pos.x), Number(poseObj.pos.y), Number(poseObj.pos.z));
      camera.quaternion.set(Number(poseObj.quat.x), Number(poseObj.quat.y), Number(poseObj.quat.z), Number(poseObj.quat.w));
      camera.updateMatrixWorld();
      return true;
    } catch (e) {
      return false;
    }
  }

  function exportHelixEndPoseForTheatreB() {
    try {
      const pose = getCameraWorldPoseObj();
      lastEndPose.current.pos.set(pose.pos.x, pose.pos.y, pose.pos.z);
      lastEndPose.current.quat.set(pose.quat.x, pose.quat.y, pose.quat.z, pose.quat.w);
      if (typeof window !== 'undefined') {
        window.__THEATRE_B_START_CAMERA__ = pose;
        window.__THEATRE_REMOTE_STATE__ = window.__THEATRE_REMOTE_STATE__ || {};
        window.__THEATRE_REMOTE_STATE__.theatreBStartCamera = pose;
      }
      bAppliedOnce.current = true;
      console.info('[CameraRig] exported helix-end pose for TheatreB start');
    } catch (e) {
      console.warn('[CameraRig] export failed', e);
    }
  }

  useEffect(() => {
    syncControlsFromGlobals();
    rebuildHelix();

    if (typeof window !== 'undefined' && window.__THEATRE_STATIC_CAMERA__) {
      const s = window.__THEATRE_STATIC_CAMERA__;
      if (s && s.pos && s.quat) {
        applyPoseToCamera(s);
        console.info('[CameraRig] applied static camera from remote JSON');
      }
    }

    registry.setCameraRef({
      camera,
      smoothJumpToTransform: ({ pos, quat }, duration = 0.6) => {
        if (!pos || !quat) {
          camera.position.copy(pos || camera.position);
          camera.quaternion.copy(quat || camera.quaternion);
          camera.updateMatrixWorld();
          return;
        }
        if (window.gsap) {
          const p = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
          window.gsap.to(p, {
            x: pos.x, y: pos.y, z: pos.z, duration, ease: 'power2.inOut', onUpdate() {
              camera.position.set(p.x, p.y, p.z);
            }
          });
          const startQuat = camera.quaternion.clone();
          const endQuat = quat.clone();
          let t = { v: 0 };
          window.gsap.to(t, { v: 1, duration, ease: 'power2.inOut', onUpdate() {
            THREE.Quaternion.slerp(startQuat, endQuat, camera.quaternion, t.v);
          }});
        } else {
          camera.position.copy(pos);
          camera.quaternion.copy(quat);
        }
      },
      getHelixStartPosition: () => {
        if (!curveRef.current || !lutRef.current) return null;
        const u0 = mapArcToU(lutRef.current, 0);
        return curveRef.current.getPoint(u0);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setInterval(() => syncControlsFromGlobals(), 200);
    return () => clearInterval(id);
  }, []);

  function overallToHelixLocal(overall, durationsObj = { theatreA: 0, helix: 1, theatreB: 0 }) {
    const remoteDur = (typeof window !== 'undefined' && window.__THEATRE_REMOTE_DURATIONS__) ? window.__THEATRE_REMOTE_DURATIONS__ : null;
    const finalDur = remoteDur || durationsObj;
    const total = Math.max(1e-6, (finalDur.theatreA || 0) + (finalDur.helix || 0) + (finalDur.theatreB || 0));
    const tA = (finalDur.theatreA || 0) / total;
    const tH = (finalDur.helix || 0) / total;
    if (overall <= tA) return 0;
    if (overall >= tA + tH) return 1;
    return Math.max(0, Math.min(1, (overall - tA) / tH));
  }

  useFrame((_, dt) => {
    if (!curveRef.current || !lutRef.current) return;
    if (camState.locked) return;

    syncControlsFromGlobals();

    if (prevMode.current !== camState.mode) {
      if (camState.mode === 'helix') blendT.current = 0;
      else blendT.current = 1;

      if (camState.mode === 'theatreB') {
        if (!bHoldActive.current) {
          const pose = (typeof window !== 'undefined' && window.__THEATRE_B_START_CAMERA__) ? window.__THEATRE_B_START_CAMERA__ :
                       (typeof window !== 'undefined' && window.__THEATRE_STATIC_CAMERA__) ? window.__THEATRE_STATIC_CAMERA__ :
                       (lastEndPose.current ? { pos: { x: lastEndPose.current.pos.x, y: lastEndPose.current.pos.y, z: lastEndPose.current.pos.z }, quat: { x: lastEndPose.current.quat.x, y: lastEndPose.current.quat.y, z: lastEndPose.current.quat.z, w: lastEndPose.current.quat.w } } : null);

          if (pose) {
            applyPoseToCamera(pose);
            bHoldActive.current = true;
            bHoldTimer.current = holdSecondsForB;
            console.info('[CameraRig] applied and holding TheatreB start pose for', holdSecondsForB, 's');
          }
        }
      } else {
        bHoldActive.current = false;
        bHoldTimer.current = 0;
        bAppliedOnce.current = false;
      }

      prevMode.current = camState.mode;
    }

    if (bHoldActive.current) {
      bHoldTimer.current -= dt;
      if (bHoldTimer.current <= 0) {
        bHoldActive.current = false;
        bHoldTimer.current = 0;
        console.info('[CameraRig] finished hold for TheatreB start pose; resuming normal camera behaviour');
      } else {
        return;
      }
    }

    let arcNorm = 0;
    if (typeof camState.progress === 'number' && camState.mode === 'helix') {
      arcNorm = camState.progress;
    } else {
      arcNorm = overallToHelixLocal(timelineOverall, durations);
    }
    arcNorm = Math.max(0, Math.min(1, arcNorm));

    if (!bAppliedOnce.current && arcNorm >= 0.9995) {
      exportHelixEndPoseForTheatreB();
      bAppliedOnce.current = true;
    }

    if (camState.mode !== 'helix' && !(arcNorm > 0 && arcNorm < 1)) {
      // not on helix — but we still want theatre timelines to update (see below)
    } else {
      if (blendT.current < 1) blendT.current = Math.min(1, blendT.current + (dt / blendDurationRef.current));

      const u = mapArcToU(lutRef.current, arcNorm);
      const p = curveRef.current.getPoint(u);

      const camOffsetX = Number(controls.camOffsetX) || 0;
      const camOffsetY = Number(controls.camOffsetY) || 0;
      const camOffsetZ = Number(controls.camOffsetZ) || 0;
      const tightFollow = !!controls.tightFollow;
      const damping = Number(controls.damping) || 6;

      desired.current.set(p.x + camOffsetX, p.y + camOffsetY, p.z + camOffsetZ);

      if (tightFollow) {
        camera.position.copy(desired.current);
      } else {
        tmp.current.copy(camera.position);
        const lambda = 1 - Math.exp(-Math.max(0.0001, damping) * dt);
        tmp.current.lerp(desired.current, lambda);
        camera.position.copy(tmp.current);
      }

      const aheadU = Math.min(1, u + 0.001);
      const tan = curveRef.current.getTangent(aheadU);
      const curveYaw = Math.atan2(tan.x, tan.z);

      const offset = initialYawOffsetRad.current || 0;
      const startYaw = curveYaw + offset;

      const twoPI = Math.PI * 2;
      const diff = ((curveYaw - startYaw + Math.PI) % (twoPI)) - Math.PI;
      const blendedYaw = startYaw + diff * blendT.current;

      const extraYaw = THREE.MathUtils.degToRad(Number(controls.camRotDegY) || 0);
      const finalYaw = blendedYaw + extraYaw;

      const rotX = THREE.MathUtils.degToRad(Number(controls.camRotDegX) || 0);
      const rotZ = THREE.MathUtils.degToRad(Number(controls.camRotDegZ) || 0);

      const euler = new THREE.Euler(rotX, finalYaw, rotZ, 'YXZ');
      camera.quaternion.setFromEuler(euler);
    }

    // --- FORCE theatre timeline seek on every frame (important) ---
    if (camState.mode === 'theatreA' || camState.mode === 'theatreB') {
      const tl = registry.getTimeline?.(camState.mode);
      if (tl && typeof tl.seekNormalized === 'function') {
        try { tl.seekNormalized(timelineOverall); } catch (e) { /* ignore */ }
      } else if (tl && typeof tl.seek === 'function') {
        try {
          const dur = tl.durationSeconds || ((registry.getDurations && registry.getDurations()[camState.mode]) || 60);
          tl.seek((timelineOverall || 0) * dur);
        } catch (e) { /* ignore */ }
      }
    }
  });

  return (
    <>
      {controls.showBriks && ptsRef.current && ptsRef.current.length > 0 && (
        <Briks
          points={ptsRef.current}
          pathScale={controls.pathScale}
          brickSpacing={controls.brickSpacing}
          brickScale={controls.brickScale}
          pathColor={controls.brickPathColor}
        />
      )}
    </>
  );
}
